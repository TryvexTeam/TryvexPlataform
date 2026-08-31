import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { excedeLimite } from '@/lib/agentes/rate-limit'
import { leerAcuse } from '@/lib/wa/acuse'
import { clavesDeAcuse } from '@/lib/wa/emparejar'
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

  const { data: actualizados, error } = await admin
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
    .in('wa_message_id', claves)
    .select('id, lead_id, cliente_id')

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
