import { randomUUID } from 'crypto'
import { getCalendarClient, getCalendarId } from '@/lib/google/auth'
import type { GoogleSyncRepository } from '@/lib/repos/google-sync'
import type { GoogleSyncState } from '@/lib/types/evento'

const RENOVAR_SI_QUEDAN_MS = 48 * 3600 * 1000 // < 48 h

function getWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) throw new Error('NEXT_PUBLIC_APP_URL no configurado')
  return `${base}/api/webhook/google-calendar`
}

export function needsRenewal(state: GoogleSyncState | null): boolean {
  if (!state?.channel_id || !state.channel_expiration) return true
  return new Date(state.channel_expiration).getTime() - Date.now() < RENOVAR_SI_QUEDAN_MS
}

/** Registra canal watch nuevo apuntando al webhook de producción */
export async function registerWatch(syncRepo: GoogleSyncRepository): Promise<{ channelId: string; expiration: string | null }> {
  const calendar = getCalendarClient()
  const calendarId = getCalendarId()
  const channelId = randomUUID()

  const { data } = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: getWebhookUrl(),
      token: process.env.GOOGLE_WEBHOOK_TOKEN,
    },
  })

  const expiration = data.expiration
    ? new Date(Number(data.expiration)).toISOString()
    : null

  await syncRepo.setChannel(calendarId, {
    channel_id: channelId,
    resource_id: data.resourceId ?? null,
    channel_expiration: expiration,
  })

  return { channelId, expiration }
}

/** Detiene el canal anterior (best-effort: si ya expiró, Google responde 404) */
export async function stopWatch(state: GoogleSyncState): Promise<void> {
  if (!state.channel_id || !state.resource_id) return
  const calendar = getCalendarClient()
  try {
    await calendar.channels.stop({
      requestBody: { id: state.channel_id, resourceId: state.resource_id },
    })
  } catch {
    // Canal ya expirado o inexistente — no es error fatal
  }
}

/** Renueva el canal si expira pronto o no existe. Devuelve si hubo renovación. */
export async function renewIfNeeded(syncRepo: GoogleSyncRepository): Promise<{ renewed: boolean; expiration: string | null }> {
  const calendarId = getCalendarId()
  const state = await syncRepo.get(calendarId)

  if (!needsRenewal(state)) {
    return { renewed: false, expiration: state?.channel_expiration ?? null }
  }

  if (state) await stopWatch(state)
  const { expiration } = await registerWatch(syncRepo)
  return { renewed: true, expiration }
}
