import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { excedeLimite } from '@/lib/agentes/rate-limit'
import { leerAcuse } from '@/lib/wa/acuse'
import {
  clavesDeAcuse,
  elegirFilaDelAcuse,
  esClaveReusable,
  VENTANA_REFERENCIA_HORAS,
} from '@/lib/wa/emparejar'
import { debeAvanzarAContactado } from '@/lib/types/lead'

/**
 * El agente avisa qué dijo WhatsApp sobre un mensaje que mandamos.
 *
 * Es la pieza que faltaba para que «enviado» signifique enviado. Hasta ahora el
 * CRM marcaba enviado cuando el agente ACEPTABA EL ENCARGO, y nadie volvía a
 * mirar: WhatsApp podía descartar el mensaje —devolviendo el acuse con
 * `error: 463`, que es lo que pasó toda esta semana— y en pantalla seguía
 * diciendo enviado, con la ficha movida a «contactado».
 *
 * El acuse llega asincrónico, segundos después del envío y por otra vía, así
 * que no se puede resolver dentro de `/api/wa/send`: tiene que poder entrar
 * después. De ahí que sea una ruta propia.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface Agente {
  id: string
  nombre: string
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
  const waMessageId = typeof cuerpo?.wa_message_id === 'string' ? cuerpo.wa_message_id.trim() : ''
  if (!waMessageId) {
    return NextResponse.json(
      { success: false, error: 'Falta wa_message_id: es lo que empareja el acuse con el mensaje' },
      { status: 400 },
    )
  }

  // Se lee el CÓDIGO del acuse, no los nombres de campo del transporte. Baileys
  // 7.0.0-rc14 renombró `key.senderPn` a `remoteJidAlt`; si mañana hay que
  // volver a la 6.x, esto tiene que seguir distinguiendo entregado de
  // descartado. Que la versión sea reversible no sirve si el código no lo es.
  const lectura = leerAcuse({ error: cuerpo?.error ?? null, leido: cuerpo?.leido === true })

  const admin = createAdminClient() as SB
  const ahora = new Date().toISOString()

  // `referencia`: el id con el que el AGENTE metió el mensaje en su propia cola.
  // Es lo único que el CRM tiene guardado en el momento del envío — el id de
  // WhatsApp no existe todavía cuando `/api/wa/send` escribe la fila. Sin este
  // segundo criterio, el `.eq('wa_message_id', ...)` de abajo matcheaba CERO
  // filas en el 100% de los envíos hechos por el agente.
  const claves = clavesDeAcuse(waMessageId, cuerpo?.referencia)

  // PRIMERO se mira, después se escribe.
  //
  // Antes esto era un `.update().in(...)` directo, y ahí estaba el problema: la
  // `referencia` del agente es el contador de SU cola —en la base: 26, 27, 28,
  // 32, 64— y una cola en memoria vuelve a empezar en 1 al reiniciar. Dos
  // mensajes de leads distintos pueden compartirla. El update las pisaba a las
  // dos, o elegía una a cara o cruz, y la ficha equivocada avanzaba a
  // «contactado». En silencio.
  //
  // Si la clave es reusable (un contador corto), la búsqueda se acota a lo
  // reciente y a lo que todavía no tiene acuse: un acuse que llega hoy no puede
  // ser de un mensaje de la semana pasada que ya se confirmó.
  const hayClaveReusable = claves.some(esClaveReusable)
  let consulta = admin
    .from('mensajes_wa')
    .select('id, lead_id, cliente_id')
    .in('wa_message_id', claves)

  if (hayClaveReusable) {
    const desde = new Date(Date.now() - VENTANA_REFERENCIA_HORAS * 3600_000).toISOString()
    consulta = consulta.is('ack_at', null).gte('created_at', desde)
  }

  const { data: candidatas, error: errorBuscar } = await consulta

  if (errorBuscar) {
    console.error('[api/agentes/wa-estado] no se pudo buscar el mensaje:', errorBuscar)
    return NextResponse.json({ success: false, error: errorBuscar.message }, { status: 500 })
  }

  const emparejamiento = elegirFilaDelAcuse(candidatas)

  // Empate: NO se adivina. Es la misma regla que se aplicó al emparejar leads
  // por teléfono el 21-ago. Escribir sobre la fila equivocada avanza una ficha
  // ajena y estampa el id real de WhatsApp donde no va — y eso ya no se puede
  // deshacer mirando los datos. Se responde 409 con las candidatas para que
  // quede rastro y el agente pueda mandar un identificador mejor.
  if (emparejamiento.tipo === 'ambiguo') {
    console.warn(
      `[api/agentes/wa-estado] acuse AMBIGUO, no se escribió nada: claves=${claves.join(',')} ` +
        `coinciden ${emparejamiento.filas.length} mensajes (${emparejamiento.filas
          .map((f) => f.id)
          .join(', ')}). El agente debería mandar un uuid propio por envío.`,
    )
    return NextResponse.json(
      {
        success: false,
        error: 'El acuse coincide con más de un mensaje: no se puede saber a cuál corresponde',
        candidatos: emparejamiento.filas.length,
        estado: lectura.estado,
      },
      { status: 409 },
    )
  }

  const { data: actualizados, error } =
    emparejamiento.tipo === 'unico'
      ? await admin
          .from('mensajes_wa')
          .update({
            estado_envio: lectura.estado,
            ack_codigo: lectura.codigo,
            ack_at: ahora,
            // Se sube el id REAL de WhatsApp: si el emparejamiento entró por la
            // referencia del agente, los acuses siguientes (entregado, leído) ya
            // caen directo por `wa_message_id`.
            wa_message_id: waMessageId,
          })
          // Por id, no por clave: la fila ya está elegida y no hay margen para
          // que el update alcance a otra.
          .eq('id', emparejamiento.fila.id)
          .select('id, lead_id, cliente_id')
      : { data: [], error: null }

  if (error) {
    console.error('[api/agentes/wa-estado] no se pudo guardar el acuse:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Un acuse sin mensaje al que colgarse no es un error del que llama: puede ser
  // de un envío anterior a que existiera este registro. Se responde 404 con el
  // dato, y se loguea el código para no perder la evidencia — el 463 se
  // diagnosticó justamente leyendo acuses crudos.
  if (!actualizados?.length) {
    console.warn(
      `[api/agentes/wa-estado] acuse sin mensaje asociado (wa_message_id=${waMessageId}, codigo=${lectura.codigo ?? 'ok'})`,
    )
    return NextResponse.json(
      { success: false, error: 'No hay ningún mensaje con ese wa_message_id', estado: lectura.estado },
      { status: 404 },
    )
  }

  // El buzón se mantiene alineado con la verdad: `enviado_at` se llena SOLO con
  // el acuse bueno. Una fila marcada 'enviado' con `enviado_at` en NULL es,
  // desde ahora, la señal de que ese mensaje nunca se confirmó — que es
  // exactamente lo que pasaba con las 11 filas del 29-ago.
  const leadId = actualizados[0].lead_id
  if (leadId) {
    if (lectura.estado === 'entregado' || lectura.estado === 'leido') {
      await admin
        .from('outreach_messages')
        .update({ enviado_at: ahora, wa_message_id: waMessageId })
        .in('wa_message_id', claves)
        .is('enviado_at', null)
        .eq('lead_id', leadId)

      // Recién acá la ficha puede avanzar: contactar es que el mensaje LLEGUE,
      // no que nosotros lo hayamos entregado a un intermediario. `/api/wa/send`
      // dejó de dar este salto a propósito — con el agente, allá todavía no se
      // sabe nada y el 463 ocurre después.
      const { data: lead } = await admin
        .from('fact_leads')
        .select('estado')
        .eq('id', leadId)
        .single()
      if (lead && debeAvanzarAContactado(lead.estado, 'whatsapp')) {
        await admin
          .from('fact_leads')
          .update({ estado: 'contactado', ultimo_contacto: ahora })
          .eq('id', leadId)
      }
    } else if (lectura.estado === 'fallido') {
      await admin
        .from('outreach_messages')
        .update({ estado: 'fallido' })
        .in('wa_message_id', claves)

      // Deshacer el avance optimista de `/api/wa/send`.
      //
      // Desde el 3-sep la ficha pasa a «contactado» al enviar, sin esperar
      // acuse — porque el acuse no llegaba nunca y los leads se quedaban en
      // «sin contactar» para siempre. El precio de esa decisión es que un
      // mensaje descartado deja la ficha avanzada de mentira. Esto lo cobra:
      // si WhatsApp confirma que NO entregó, el lead vuelve atrás.
      //
      // Solo se revierte desde «contactado». Si alguien ya lo movió a
      // «interesado» o más allá, hubo contacto real por otra vía y no somos
      // nadie para pisar ese trabajo.
      //
      // Y solo si no queda ningún otro saliente entregado: si de tres mensajes
      // uno se descartó pero otro llegó, el lead SÍ fue contactado.
      const { data: entregados } = await admin
        .from('mensajes_wa')
        .select('id')
        .eq('lead_id', leadId)
        .in('estado_envio', ['entregado', 'leido'])
        .limit(1)

      if (!entregados?.length) {
        const { error: errorRevertir } = await admin
          .from('fact_leads')
          .update({ estado: 'sin_contactar' })
          .eq('id', leadId)
          .eq('estado', 'contactado')

        if (errorRevertir) {
          console.error(
            `[api/agentes/wa-estado] no se pudo revertir el lead ${leadId} tras acuse fallido (${lectura.codigo}):`,
            errorRevertir,
          )
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      actualizados: actualizados.length,
      estado: lectura.estado,
      codigo: lectura.codigo,
      motivo: lectura.motivo,
    },
  })
}
