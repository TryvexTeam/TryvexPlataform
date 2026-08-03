import 'server-only'
import webpush from 'web-push'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/** Payload que recibe el service worker en `push`. */
export interface PushPayload {
  titulo: string
  cuerpo?: string
  link?: string
  /** Agrupa notificaciones: una nueva con el mismo tag reemplaza a la anterior. */
  tag?: string
}

interface SuscripcionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let configurado = false

/** Devuelve false (sin lanzar) si faltan las llaves VAPID: el push es best-effort. */
function configurar(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privada = process.env.VAPID_PRIVATE_KEY
  const contacto = process.env.VAPID_SUBJECT ?? 'mailto:tryvexentreprise@gmail.com'

  if (!publica || !privada) return false
  if (!configurado) {
    webpush.setVapidDetails(contacto, publica, privada)
    configurado = true
  }
  return true
}

/** Cliente con service role: el envío ocurre fuera del contexto del usuario (crons, webhooks). */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Envía una notificación push a todos los dispositivos de los integrantes indicados.
 * Nunca lanza: si el push falla, la notificación in-app ya quedó guardada igual.
 * Devuelve cuántos envíos salieron y cuántas suscripciones muertas se limpiaron.
 */
export async function enviarPush(
  integranteIds: string[],
  payload: PushPayload,
): Promise<{ enviados: number; limpiados: number; motivo?: string }> {
  const ids = [...new Set(integranteIds)].filter(Boolean)
  if (ids.length === 0) return { enviados: 0, limpiados: 0, motivo: 'sin_destinatarios' }
  if (!configurar()) return { enviados: 0, limpiados: 0, motivo: 'vapid_no_configurado' }

  const sb = serviceClient()
  if (!sb) return { enviados: 0, limpiados: 0, motivo: 'supabase_no_configurado' }

  const { data, error } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('integrante_id', ids)

  if (error) return { enviados: 0, limpiados: 0, motivo: error.message }

  const subs = (data ?? []) as SuscripcionRow[]
  if (subs.length === 0) return { enviados: 0, limpiados: 0, motivo: 'sin_suscripciones' }

  const cuerpo = JSON.stringify(payload)
  const muertas: string[] = []
  let enviados = 0

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          cuerpo,
        )
        enviados++
      } catch (err: unknown) {
        // 404/410 = el navegador revocó la suscripción; se borra para no reintentar siempre.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) muertas.push(sub.id)
        else console.error('[push]', status, err instanceof Error ? err.message : err)
      }
    }),
  )

  if (muertas.length > 0) await sb.from('push_subscriptions').delete().in('id', muertas)
  if (enviados > 0) {
    await sb
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', subs.filter((s) => !muertas.includes(s.id)).map((s) => s.id))
  }

  return { enviados, limpiados: muertas.length }
}
