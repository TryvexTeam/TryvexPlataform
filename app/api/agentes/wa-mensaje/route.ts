import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { excedeLimite } from '@/lib/agentes/rate-limit'
import { resolverDestinatario } from '@/lib/agentes/destinatario'
import { esDuplicadoSaliente, VENTANA_DUPLICADO_MS } from '@/lib/wa/duplicado'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface Agente {
  id: string
  nombre: string
  creado_por: string | null
  token_hash: string
  expira_at: string | null
}

async function autenticar(req: Request): Promise<Agente | null> {
  const token = tokenDeCabecera(req)
  if (!token) return null

  const admin = createAdminClient() as SB
  const { data } = await admin.from('agentes').select('*').eq('activo', true)

  const agente = ((data ?? []) as Agente[]).find((a) => tokenCoincide(token, a.token_hash))
  if (!agente || tokenExpirado(agente.expira_at)) return null

  await admin.from('agentes').update({ ultimo_uso_at: new Date().toISOString() }).eq('id', agente.id)
  return agente
}

export async function POST(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const espera = excedeLimite(agente.id)
  if (espera !== null) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes' },
      { status: 429, headers: { 'Retry-After': String(espera) } },
    )
  }

  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo || !cuerpo.texto) {
    return NextResponse.json({ success: false, error: 'Falta el texto del mensaje' }, { status: 400 })
  }

  const direccion = cuerpo.direccion === 'in' ? 'in' : 'out'
  const admin = createAdminClient() as SB

  // A quién pertenece el mensaje. Se acepta el id directo —como venía— y
  // también el teléfono, porque un agente que atiende WhatsApp conoce el número
  // de quien le escribe, no el uuid de su ficha.
  let leadId: string | null = cuerpo.lead_id ?? null
  let clienteId: string | null = cuerpo.cliente_id ?? null

  if (!leadId && !clienteId && cuerpo.telefono) {
    const quien = await resolverDestinatario(admin, cuerpo.telefono)

    // 409 y no 404: el número SÍ corresponde a alguien, el problema es que
    // corresponde a dos. Colgar el mensaje de cualquiera de las dos fichas lo
    // mete en la conversación de otro negocio, así que no se guarda hasta que
    // una persona corrija el teléfono duplicado.
    if (quien.estado === 'ambiguo') {
      return NextResponse.json(
        {
          success: false,
          error: 'Ese teléfono está en más de una ficha; el mensaje no se guardó para no colgarlo de la equivocada',
          candidatos: quien.candidatos.map((c) => ({ tipo: c.tipo, id: c.id, nombre: c.nombre })),
        },
        { status: 409 },
      )
    }

    if (quien.estado === 'desconocido') {
      // 404 y no 400: la petición está bien formada, simplemente ese número no
      // corresponde a nadie en la base. Quien llama decide qué hacer — y la
      // decisión de crear una ficha con un desconocido no se toma acá.
      return NextResponse.json(
        { success: false, error: 'Ese teléfono no corresponde a ningún lead ni cliente' },
        { status: 404 },
      )
    }

    if (quien.destinatario.tipo === 'lead') leadId = quien.destinatario.id
    else clienteId = quien.destinatario.id
  }

  if (!leadId && !clienteId) {
    return NextResponse.json(
      { success: false, error: 'Falta lead_id, cliente_id o telefono' },
      { status: 400 },
    )
  }

  if (cuerpo.lead_id) {
    const { data: lead } = await admin.from('fact_leads').select('id').eq('id', cuerpo.lead_id).maybeSingle()
    if (!lead) return NextResponse.json({ success: false, error: 'lead_id no existe' }, { status: 400 })
  }
  if (cuerpo.cliente_id) {
    const { data: cliente } = await admin.from('dim_clientes').select('id').eq('id', cuerpo.cliente_id).maybeSingle()
    if (!cliente) return NextResponse.json({ success: false, error: 'cliente_id no existe' }, { status: 400 })
  }

  // `es_bot` describe quién ESCRIBIÓ, y un mensaje entrante lo escribió la
  // persona del otro lado. Antes iba `true` fijo, lo que marcaba como del bot
  // todo lo que registrara un agente — incluido lo que decía el lead.
  const esEntrante = direccion === 'in'

  // ── Nada de esto se guarda dos veces ──────────────────────────────────────
  //
  // El agente reporta el mismo saliente más de una vez (al mandarlo y otra vez
  // con el eco del socket), y por eso en el hilo del CRM aparecían burbujas
  // repetidas que en WhatsApp Web salen una sola vez. El índice único sobre
  // `wa_message_id` no alcanza: es parcial y la referencia del agente es un
  // contador que se reinicia, así que llega `null` o repetida.
  const columna = leadId ? 'lead_id' : 'cliente_id'
  const destinatarioId = leadId ?? clienteId

  // 1. Por referencia, cuando el agente la manda: es el criterio exacto.
  if (cuerpo.wa_message_id) {
    const { data: yaEsta } = await admin
      .from('mensajes_wa')
      .select('id')
      .eq('wa_message_id', cuerpo.wa_message_id)
      .eq(columna, destinatarioId)
      .maybeSingle()

    if (yaEsta) {
      return NextResponse.json({ success: true, data: yaEsta, duplicado: true })
    }
  }

  // 2. Por contenido y ventana corta, solo para lo que sale de Tryvex. Un lead
  //    que escribe «ok» dos veces mandó dos mensajes y los dos se guardan.
  if (!esEntrante) {
    const desde = new Date(Date.now() - VENTANA_DUPLICADO_MS).toISOString()
    const { data: recientes } = await admin
      .from('mensajes_wa')
      .select('id, texto, direccion, created_at')
      .eq(columna, destinatarioId)
      .gte('created_at', desde)

    if (esDuplicadoSaliente({ texto: cuerpo.texto }, recientes ?? [])) {
      return NextResponse.json({ success: true, duplicado: true })
    }
  }

  const { data, error } = await admin
    .from('mensajes_wa')
    .insert({
      lead_id: leadId,
      cliente_id: clienteId,
      direccion,
      texto: cuerpo.texto,
      wa_message_id: cuerpo.wa_message_id ?? null,
      chip_id: cuerpo.chip_id ?? null,
      es_bot: esEntrante ? false : cuerpo.es_bot !== false,
      // Quien lo mandó: el lead no tiene nombre de remitente en esta tabla, y
      // poner ahí el nombre del agente haría parecer que lo escribió él.
      enviado_por: esEntrante ? null : agente.nombre,
      estado_envio: esEntrante ? null : 'enviado',
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = choque con `uq_mensajes_wa_waid`. Que el agente reintente un
    // mensaje ya guardado no es un fallo del servidor: el mensaje está en el
    // hilo, que es lo que el agente quería. Un 500 acá lo hace reintentar en
    // vano y ensucia el log de errores de verdad.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ success: true, duplicado: true })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Un mensaje del lead ES una interacción: mueve `ultimo_contacto`, que es lo
  // que alimenta el «requiere acción hoy» del panel. Va aparte y sin cortar la
  // respuesta si falla — perder el registro del mensaje sería peor que perder
  // la marca de tiempo.
  if (esEntrante && leadId) {
    const ahora = new Date().toISOString()
    await admin.from('fact_leads').update({ ultimo_contacto: ahora }).eq('id', leadId)
    await admin.from('interacciones_lead').insert({
      lead_id: leadId,
      tipo: 'whatsapp',
      contenido: cuerpo.texto.slice(0, 500),
      // Un mensaje entrante ES una respuesta: el lead contestó. Es lo que
      // separa un contacto que prendió de uno que quedó sin acuse.
      respondio: true,
    })
  }

  return NextResponse.json({ success: true, data })
}
