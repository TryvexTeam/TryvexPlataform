import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizarTelefono } from '@/lib/vex/telefono'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { AsignacionesRepository } from '@/lib/repos/asignaciones'
import { MensajesWaRepository } from '@/lib/repos/mensajes-wa'
import { debeAvanzarAContactado } from '@/lib/types/lead'
import { transporteActivo, enviarPorVex } from '@/lib/wa/transporte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

// Contrato acordado con la vista de Leads (Jarvis): el panel llama a este
// endpoint con { lead_id, telefono, texto, enviado_por } al apretar
// "Enviar desde el CRM" (Botón 2). El telefono del body es solo referencia;
// si hay lead_id, se resuelve el telefono real desde fact_leads en el
// servidor para no confiar en un valor que pudo ser manipulado en el cliente.
const bodySchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  telefono: z.string().optional(),
  texto: z.string().min(1),
  // Se acepta por compatibilidad con el contrato viejo, pero YA NO SE USA como
  // autor: el navegador mandaba "Equipo" fijo y así era imposible saber quién
  // había hablado. La autoría sale de la sesión autenticada (ver más abajo).
  enviado_por: z.string().min(1).optional(),
  es_bot: z.boolean().optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Tener sesión no alcanza. Más abajo esta ruta usa la clave de servicio, que
  // salta la RLS: sin este chequeo, cualquiera con una cuenta podía mandar un
  // WhatsApp a un cliente desde el número de la agencia. El daño no es leer
  // datos, es hablar en nombre de Tryvex.
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ error: 'No eres integrante activo' }, { status: 403 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { lead_id, texto } = parsed.data

  // La autoría la decide el servidor, no el cliente. `perfil` viene de la
  // sesión autenticada, así que el nombre que queda registrado es siempre el
  // de un integrante real y no se puede falsear desde el navegador.
  const autorNombre = perfil.nombre

  // outreach_messages.lead_id es NOT NULL: el buzon sirve para leads. Mandarle
  // a un cliente sigue siendo posible por el camino viejo hasta que se decida
  // moverlo (fuera del alcance del pedido del 10-ago).
  if (!lead_id) {
    return NextResponse.json(
      { error: 'Falta lead_id. El envio a clientes todavia no pasa por el buzon.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient() as SB
  let telefono = parsed.data.telefono ?? null
  let nombreNegocio: string | null = null

  if (lead_id) {
    const { data: lead } = await admin
      .from('fact_leads')
      .select('telefono, nombre_negocio')
      .eq('id', lead_id)
      .single()
    if (!lead) return NextResponse.json({ error: 'Lead no encontrado.' }, { status: 404 })
    telefono = lead.telefono
    nombreNegocio = lead.nombre_negocio ?? null
  }

  const numero = normalizarTelefono(telefono)
  if (!numero) {
    return NextResponse.json({ error: 'Teléfono inválido o inexistente para ese destinatario.' }, { status: 400 })
  }

  // Con el agente como transporte, el mensaje sale por ahí y NO se anota en el
  // buzón: dos transportes tirando del mismo mensaje lo mandarían dos veces.
  // El registro en `outreach_messages` se hace igual más abajo, pero ya como
  // 'enviado', no como pendiente de que alguien lo recoja.
  //
  // Si el agente falla no se cae al puente en silencio: son dos sesiones
  // distintas del mismo número y elegir sola cuál usa es justo la clase de
  // decisión que no debe tomar un `catch`. Se devuelve el error y la persona
  // decide.
  let referenciaVex: string | number | undefined
  let avisoRegistro: string | undefined
  if (transporteActivo() === 'vex') {
    const envio = await enviarPorVex(numero, texto, nombreNegocio ?? undefined)
    if (!envio.ok) {
      return NextResponse.json(
        { error: envio.error ?? 'El agente no pudo enviar el mensaje.' },
        { status: 502 }
      )
    }
    referenciaVex = envio.referencia

    // El mensaje ya salió: hay que dejarlo en el hilo del lead. Lo escribe esta
    // ruta porque con el agente como transporte nadie más lo hace.
    //
    // El chat del lead dibuja `mensajes_wa`, y el ÚNICO que escribía ahí era el
    // puente, al confirmar cada envío. Al pasar el transporte al agente el
    // puente quedó fuera del camino y ese registro se perdió con él: el mensaje
    // salía de verdad, `outreach_messages` decía 'enviado', y el hilo quedaba
    // vacío. Desde la pantalla se ve exactamente igual que no haber mandado
    // nada — que fue justo lo que reportó Cristian.
    try {
      await new MensajesWaRepository(admin).registrarSaliente({
        lead_id,
        cliente_id: null,
        texto,
        // Lo escribió una persona en el chat del CRM, no el bot.
        es_bot: false,
        enviado_por: autorNombre,
        // El chip lo pone el agente, que es quien tiene la sesión.
        chip_id: null,
        waMessageId: referenciaVex !== undefined ? String(referenciaVex) : null,
      })
    } catch (e) {
      // No se devuelve error: el WhatsApp YA salió y decirle a la persona que
      // falló la haría mandarlo de nuevo. Se registra fuerte y se avisa en la
      // respuesta, que es lo que permite mostrarlo en pantalla en vez de dejar
      // un hilo vacío sin explicación.
      console.error(
        `[api/wa/send] CRITICO: el mensaje salio por el agente pero no se pudo anotar en mensajes_wa (lead ${lead_id}). No va a aparecer en el hilo. Texto: ${texto}`,
        e
      )
      avisoRegistro = 'El mensaje salió, pero no se pudo dejar en el hilo del chat.'
    }
  }

  // El CRM ya no llama al puente: lo anota aca y el puente lo pasa a buscar.
  // El puente escucha en 127.0.0.1 del VPS — desde Vercel es inalcanzable, y
  // exponerlo pedia un tunel cuya direccion cambia en cada reinicio. Mismo
  // patron que scraper_runs: si el puente esta caido, esto queda encolado en
  // vez de perderse. Ver migracion 041 y el diseno del 10-ago-2026.
  const { data: encolado, error: errorEncolar } = await admin
    .from('outreach_messages')
    .insert({
      lead_id,
      canal: 'whatsapp',
      texto,
      // Por el agente ya salió: queda 'enviado' para que nadie lo recoja otra vez.
      estado: referenciaVex !== undefined ? 'enviado' : 'encolado',
      // Esta ruta es el chat del CRM, no el primer contacto. La distinción
      // importa: `uq_outreach_primer_contacto` deja un solo 'enviado' por lead,
      // y sin marcarlo el segundo mensaje de una conversación reventaba con 500
      // (migración 097).
      tipo: 'chat',
      enviado_por: autorNombre,
      integrante_id: perfil.id,
      aprobado_por: perfil.id,
      // Sin esto el acuse no tenía por dónde agarrar esta fila: `wa-estado`
      // actualiza `outreach_messages` por `wa_message_id` y el insert nunca lo
      // ponía, así que el update matcheaba CERO filas siempre. La referencia
      // del agente viajaba por la red y se descartaba en la misma línea que
      // escribía el estado.
      wa_message_id: referenciaVex !== undefined ? String(referenciaVex) : null,
    })
    .select('id')
    .single()

  if (errorEncolar) {
    console.error('[api/wa/send] no se pudo encolar:', errorEncolar)
    return NextResponse.json({ error: 'No se pudo encolar el mensaje.' }, { status: 500 })
  }

  // Contactar es asignarse (PRP-008): el primero que le escribe a un lead queda
  // como owner, los siguientes como colaboradores. Va DESPUÉS de encolar y en
  // try/catch a propósito — si la asignación falla, el mensaje igual se manda.
  // Perder una asignación es recuperable; perder un WhatsApp al cliente, no.
  let rolAsignado: string | null = null
  try {
    const asignaciones = new AsignacionesRepository(supabase)
    rolAsignado = await asignaciones.autoAsignarPorContacto(lead_id, perfil.id)

    await admin.from('interacciones_lead').insert({
      lead_id,
      integrante_id: perfil.id,
      tipo: 'whatsapp',
      contenido: texto,
    })

    // Escribirle a un lead ES contactarlo. Antes esta ruta lo asignaba pero
    // dejaba el estado intacto, así que el lead seguía figurando como "sin
    // contactar" después de haberle mandado un WhatsApp — y `ultimo_contacto`,
    // que es lo que mide "Requiere acción hoy" en el panel, no se movía.
    const { data: lead } = await admin
      .from('fact_leads')
      .select('estado')
      .eq('id', lead_id)
      .single()

    if (lead) {
      const cambios: { ultimo_contacto: string; estado?: string } = {
        ultimo_contacto: new Date().toISOString(),
      }
      // Escribirle a un lead lo deja en «contactado». Esto volvió acá el
      // 3-sep por pedido de Cristian, y conviene dejar escrito por qué, porque
      // en agosto se hizo justo lo contrario.
      //
      // El 29-ago se sacó este salto de aquí: con el agente como transporte,
      // `referenciaVex` es solo el id con el que el agente metió el mensaje en
      // SU cola, y el error 463 de WhatsApp ocurre después. Marcar contactado
      // en ese momento dejó 11 fichas avanzadas sin que llegara un solo
      // mensaje. La decisión entonces fue esperar el acuse en
      // `/api/agentes/wa-estado`.
      //
      // Esa espera no funcionó: al 3-sep hay CERO acuses recibidos en toda la
      // historia de la tabla (60 mensajes, 0 con `ack_at`; 40 filas de
      // outreach, 0 con `enviado_at`). El agente nunca llamó a ese endpoint.
      // Así que la ficha no avanzaba nunca y el equipo perdía de vista a quién
      // ya le habían escrito — que es peor, en el día a día, que avanzarla de
      // más.
      //
      // Se elige el error barato sobre el caro: si el mensaje se descarta, el
      // acuse —cuando exista— lo devuelve a `sin_contactar` (ver abajo en
      // wa-estado). Si en cambio no avanzamos nunca, el equipo le escribe dos
      // veces al mismo lead y eso sí quema el número.
      if (debeAvanzarAContactado(lead.estado, 'whatsapp')) {
        cambios.estado = 'contactado'
      }
      await admin.from('fact_leads').update(cambios).eq('id', lead_id)
    }
  } catch (e) {
    console.error('[api/wa/send] mensaje encolado pero fallo la asignacion/interaccion:', e)
  }

  // 202 y no 200: el mensaje esta aceptado, todavia no entregado.
  return NextResponse.json(
    {
      ok: true,
      encolado: true,
      id: encolado.id,
      asignado_como: rolAsignado,
      ...(avisoRegistro ? { advertencia: avisoRegistro } : {}),
    },
    { status: 202 }
  )
}
