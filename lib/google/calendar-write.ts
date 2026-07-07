import { randomUUID } from 'crypto'
import { getCalendarClient, getCalendarId } from '@/lib/google/auth'

export interface GoogleEventCreado {
  google_event_id: string
  meet_link: string | null
  html_link: string | null
}

/**
 * Crea el evento en Google Calendar con sala de Meet e invitaciones por email.
 * CRM → Google: el webhook de vuelta no pisa el evento (upsert preserva origen crm).
 */
export async function crearEventoEnGoogle(input: {
  titulo: string
  inicio: string
  fin: string
  notas?: string | null
  invitadosEmails: string[]
}): Promise<GoogleEventCreado> {
  const calendar = getCalendarClient()
  const { data } = await calendar.events.insert({
    calendarId: getCalendarId(),
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: input.titulo,
      description: input.notas ?? undefined,
      start: { dateTime: input.inicio },
      end: { dateTime: input.fin },
      attendees: input.invitadosEmails.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  })

  if (!data.id) throw new Error('Google no devolvió ID de evento')

  return {
    google_event_id: data.id,
    meet_link:
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
      null,
    html_link: data.htmlLink ?? null,
  }
}

/** Borra el evento en Google Calendar. 404/410 (ya no existe) no es error. */
export async function borrarEventoEnGoogle(googleEventId: string): Promise<void> {
  const calendar = getCalendarClient()
  try {
    await calendar.events.delete({
      calendarId: getCalendarId(),
      eventId: googleEventId,
      sendUpdates: 'all',
    })
  } catch (error: unknown) {
    const status = (error as { code?: number; response?: { status?: number } })
    const code = status?.code ?? status?.response?.status
    if (code !== 404 && code !== 410) throw error
  }
}
