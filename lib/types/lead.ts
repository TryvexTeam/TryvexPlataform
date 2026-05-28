import { z } from 'zod'

export const LeadSchema = z.object({
  id: z.string().uuid(),
  nombre_negocio: z.string(),
  telefono: z.string().nullable(),
  info_texto: z.string().nullable(),
  redes_sociales: z.record(z.string(), z.string()).nullable(),
  tiene_web: z.boolean().nullable(),
  url_web: z.string().nullable(),
  nicho: z.string().nullable(),
  localidad: z.string().nullable(),
  score: z.number().min(1).max(10).nullable(),
  estado: z.enum(['sin_contactar', 'contactado', 'interesado', 'reunion_agendada', 'cerrado', 'descartado']),
  responsable_id: z.string().uuid().nullable(),
  origen: z.enum(['scraper', 'manual', 'referido']),
  ultimo_contacto: z.string().nullable(),
  notas: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const LeadInsertSchema = z.object({
  nombre_negocio: z.string().min(1, 'El nombre es requerido'),
  telefono: z.string().nullable().optional(),
  info_texto: z.string().nullable().optional(),
  redes_sociales: z.record(z.string(), z.string()).nullable().optional(),
  tiene_web: z.boolean().nullable().optional(),
  url_web: z.string().nullable().optional(),
  nicho: z.string().nullable().optional(),
  localidad: z.string().nullable().optional(),
  score: z.number().min(1).max(10).nullable().optional(),
  estado: z.enum(['sin_contactar', 'contactado', 'interesado', 'reunion_agendada', 'cerrado', 'descartado']).default('sin_contactar'),
  responsable_id: z.string().uuid().nullable().optional(),
  origen: z.enum(['scraper', 'manual', 'referido']).default('manual'),
  notas: z.string().nullable().optional(),
})

export const LeadUpdateSchema = LeadInsertSchema.partial()

export const InteraccionInsertSchema = z.object({
  lead_id: z.string().uuid(),
  tipo: z.enum(['whatsapp', 'llamada', 'instagram', 'meet', 'email', 'nota']),
  contenido: z.string().nullable().optional(),
  respondio: z.boolean().nullable().optional(),
})

export type Lead = z.infer<typeof LeadSchema>
export type LeadInsert = z.infer<typeof LeadInsertSchema>
export type LeadUpdate = z.infer<typeof LeadUpdateSchema>

export type Interaccion = {
  id: string
  lead_id: string
  integrante_id: string | null
  tipo: 'whatsapp' | 'llamada' | 'instagram' | 'meet' | 'email' | 'nota'
  contenido: string | null
  respondio: boolean | null
  created_at: string
  integrante?: { nombre: string; avatar_url: string | null } | null
}

export const ESTADOS_LEAD = [
  { id: 'sin_contactar', label: 'Sin contactar', color: '#94a3b8' },
  { id: 'contactado', label: 'Contactado', color: '#60a5fa' },
  { id: 'interesado', label: 'Interesado', color: '#f59e0b' },
  { id: 'reunion_agendada', label: 'Reunión agendada', color: '#a78bfa' },
  { id: 'cerrado', label: 'Cerrado', color: '#22c55e' },
  { id: 'descartado', label: 'Descartado', color: '#f87171' },
] as const
