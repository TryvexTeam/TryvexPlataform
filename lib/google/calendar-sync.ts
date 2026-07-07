import type { calendar_v3 } from 'googleapis'
import { getCalendarClient, getCalendarId } from '@/lib/google/auth'
import type { EventosRepository } from '@/lib/repos/eventos'
import type { GoogleSyncRepository } from '@/lib/repos/google-sync'
import type { EventoDesdeGoogle } from '@/lib/types/evento'

const TZ = 'America/Santiago'
const FULL_RESYNC_DIAS_ATRAS = 30
const DURACION_MINIMA_MIN = 30
const ALL_DAY_INICIO = '09:00'
const ALL_DAY_FIN = '18:00'

// Portado de tryvex-landing: hora local Santiago → UTC correcto a través de DST
function santiagoToUTC(dateISO: string, time: string): Date {
  const asUTC = new Date(`${dateISO}T${time}:00Z`)
  const santiagoLocal = asUTC.toLocaleString('sv-SE', { timeZone: TZ })
  const offset = asUTC.getTime() - new Date(santiagoLocal.replace(' ', 'T') + 'Z').getTime()
  return new Date(asUTC.getTime() + offset)
}

function mapTipo(summary: string): EventoDesdeGoogle['tipo'] {
  return summary.startsWith('Llamada Tryvex') ? 'reunion_lead' : 'otro'
}

/** null = evento sin datos mapeables (se ignora) */
export function mapGoogleEvent(ev: calendar_v3.Schema$Event): EventoDesdeGoogle | null {
  if (!ev.id) return null

  let inicio: Date
  let fin: Date

  if (ev.start?.dateTime && ev.end?.dateTime) {
    inicio = new Date(ev.start.dateTime)
    fin = new Date(ev.end.dateTime)
  } else if (ev.start?.date) {
    // All-day → bloque 09:00–18:00 Santiago del día de inicio
    inicio = santiagoToUTC(ev.start.date, ALL_DAY_INICIO)
    fin = santiagoToUTC(ev.start.date, ALL_DAY_FIN)
  } else {
    return null
  }

  // EventoInsertSchema exige fin > inicio — duración 0 o negativa se ajusta
  if (fin.getTime() <= inicio.getTime()) {
    fin = new Date(inicio.getTime() + DURACION_MINIMA_MIN * 60000)
  }

  const titulo = ev.summary?.trim() || '(Sin título)'

  return {
    google_event_id: ev.id,
    titulo,
    tipo: mapTipo(titulo),
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    notas: ev.description ?? null,
  }
}

export interface SyncResult {
  upserted: number
  deleted: number
  fullResync: boolean
}

interface GoogleApiError {
  code?: number
  response?: { status?: number }
}

function isGone(error: unknown): boolean {
  const e = error as GoogleApiError
  return e?.code === 410 || e?.response?.status === 410
}

/** Aplica una página de eventos al CRM */
async function aplicarEventos(
  items: calendar_v3.Schema$Event[],
  eventosRepo: EventosRepository
): Promise<{ upserted: number; deleted: number }> {
  let upserted = 0
  let deleted = 0
  for (const ev of items) {
    if (ev.status === 'cancelled') {
      if (ev.id) {
        await eventosRepo.deleteByGoogleId(ev.id)
        deleted++
      }
      continue
    }
    const mapped = mapGoogleEvent(ev)
    if (!mapped) continue
    await eventosRepo.upsertFromGoogle(mapped)
    upserted++
  }
  return { upserted, deleted }
}

async function listarYAplicar(
  params: calendar_v3.Params$Resource$Events$List,
  eventosRepo: EventosRepository
): Promise<{ upserted: number; deleted: number; nextSyncToken: string | null }> {
  const calendar = getCalendarClient()
  let upserted = 0
  let deleted = 0
  let pageToken: string | undefined
  let nextSyncToken: string | null = null

  do {
    const { data } = await calendar.events.list({ ...params, pageToken })
    const r = await aplicarEventos(data.items ?? [], eventosRepo)
    upserted += r.upserted
    deleted += r.deleted
    pageToken = data.nextPageToken ?? undefined
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken
  } while (pageToken)

  return { upserted, deleted, nextSyncToken }
}

/** Full resync: ventana desde hace 30 días, obtiene syncToken nuevo */
export async function fullResync(
  eventosRepo: EventosRepository,
  syncRepo: GoogleSyncRepository
): Promise<SyncResult> {
  const calendarId = getCalendarId()
  const timeMin = new Date(Date.now() - FULL_RESYNC_DIAS_ATRAS * 24 * 3600 * 1000).toISOString()

  const { upserted, deleted, nextSyncToken } = await listarYAplicar(
    { calendarId, timeMin, singleEvents: true, showDeleted: true, maxResults: 250 },
    eventosRepo
  )

  await syncRepo.setSyncToken(calendarId, nextSyncToken)
  return { upserted, deleted, fullResync: true }
}

/** Sync incremental con syncToken; 410 GONE → full resync automático */
export async function syncIncremental(
  eventosRepo: EventosRepository,
  syncRepo: GoogleSyncRepository
): Promise<SyncResult> {
  const calendarId = getCalendarId()
  const state = await syncRepo.get(calendarId)

  if (!state?.sync_token) {
    return fullResync(eventosRepo, syncRepo)
  }

  try {
    const { upserted, deleted, nextSyncToken } = await listarYAplicar(
      { calendarId, syncToken: state.sync_token, singleEvents: true, showDeleted: true, maxResults: 250 },
      eventosRepo
    )
    await syncRepo.setSyncToken(calendarId, nextSyncToken ?? state.sync_token)
    return { upserted, deleted, fullResync: false }
  } catch (error: unknown) {
    if (isGone(error)) {
      await syncRepo.setSyncToken(calendarId, null)
      return fullResync(eventosRepo, syncRepo)
    }
    throw error
  }
}
