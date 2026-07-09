import { z } from 'zod'

export const TIPOS_EVENTO = [
  { id: 'reunion_lead', label: 'Reunión con lead', color: '#E8352A' },
  { id: 'interno', label: 'Interno', color: '#60a5fa' },
  { id: 'entrega', label: 'Entrega', color: '#22c55e' },
  { id: 'otro', label: 'Otro', color: '#a78bfa' },
] as const

export const EventoInsertSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  tipo: z.enum(['reunion_lead', 'interno', 'entrega', 'otro']).default('interno'),
  inicio: z.string().datetime({ offset: true }),
  fin: z.string().datetime({ offset: true }),
  lead_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  notas: z.string().nullable().optional(),
  asistentes_ids: z.array(z.string().uuid()).default([]),
  invitados_externos: z.array(z.string().email('Email inválido')).max(10).default([]),
}).refine((e) => new Date(e.fin) > new Date(e.inicio), {
  message: 'El fin debe ser posterior al inicio',
  path: ['fin'],
})

export type EventoInsert = z.infer<typeof EventoInsertSchema>

/** Asistente externo del evento en Google Calendar (no es integrante del CRM) */
export interface AsistenteExterno {
  email: string
  nombre: string | null
  respuesta: 'accepted' | 'declined' | 'tentative' | 'needsAction' | null
}

export interface Evento {
  id: string
  titulo: string
  tipo: 'reunion_lead' | 'interno' | 'entrega' | 'otro'
  inicio: string
  fin: string
  lead_id: string | null
  cliente_id: string | null
  creado_por: string | null
  notas: string | null
  created_at: string
  google_event_id: string | null
  origen: 'crm' | 'google'
  meet_link: string | null
  ubicacion: string | null
  html_link: string | null
  asistentes_externos: AsistenteExterno[]
  asistentes: { integrante_id: string; nombre: string }[]
  es_mio: boolean
}

/** Evento normalizado desde Google Calendar, listo para upsert */
export interface EventoDesdeGoogle {
  google_event_id: string
  titulo: string
  tipo: Evento['tipo']
  inicio: string
  fin: string
  notas: string | null
  meet_link: string | null
  ubicacion: string | null
  html_link: string | null
  asistentes_externos: AsistenteExterno[]
}

export interface GoogleSyncState {
  id: string
  calendar_id: string
  sync_token: string | null
  channel_id: string | null
  resource_id: string | null
  channel_expiration: string | null
  last_sync_at: string | null
  created_at: string
}
