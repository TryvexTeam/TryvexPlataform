import { z } from 'zod'

/**
 * Los estados del pipeline, en orden de avance.
 *
 * `perdido` y `descartado` no son etapas del embudo sino salidas: perdido
 * avanzó y se cayó, descartado nunca calificó. Por eso van al final y no
 * cuentan como progreso.
 */
export const EstadoLeadSchema = z.enum([
  'sin_contactar',
  'contactado',
  'interesado',
  'reunion_agendada',
  'ganado',
  'perdido',
  'descartado',
])

export type EstadoLead = z.infer<typeof EstadoLeadSchema>

/**
 * Tipos de interacción que cuentan como HABER CONTACTADO al lead.
 *
 * `nota` queda fuera a propósito: anotar "me lo recomendó Pedro" no es haber
 * hablado con nadie. Solo cuentan los canales donde hay una persona del otro
 * lado, porque de eso depende que el lead avance a "contactado" y que el
 * panel lo deje de marcar como frío.
 */
export const TIPOS_QUE_CONTACTAN = ['whatsapp', 'llamada', 'instagram', 'meet', 'email'] as const

export function esContacto(tipo: string): boolean {
  return (TIPOS_QUE_CONTACTAN as readonly string[]).includes(tipo)
}

/**
 * Estados que ya superaron "contactado".
 *
 * Registrar una llamada sobre un lead que ya está en "interesado" no puede
 * devolverlo atrás: el avance del pipeline lo decide una persona, y lo
 * automático solo cubre el primer tramo.
 */
const YA_CONTACTADOS: readonly EstadoLead[] = [
  'contactado',
  'interesado',
  'reunion_agendada',
  'ganado',
  'perdido',
  'descartado',
]

export function debeAvanzarAContactado(estadoActual: EstadoLead, tipo: string): boolean {
  return esContacto(tipo) && !YA_CONTACTADOS.includes(estadoActual)
}

export const LeadSchema = z.object({
  id: z.string().uuid(),
  nombre_negocio: z.string(),
  telefono: z.string().nullable(),
  // Datos de contacto para confirmar/corregir en la llamada. `email` y
  // `nombre_contacto` viven en fact_leads desde la migración 083.
  email: z.string().nullable().optional(),
  nombre_contacto: z.string().nullable().optional(),
  info_texto: z.string().nullable(),
  redes_sociales: z.record(z.string(), z.string()).nullable(),
  tiene_web: z.boolean().nullable(),
  url_web: z.string().nullable(),
  instagram: z.string().nullable().optional(),
  nicho: z.string().nullable(),
  localidad: z.string().nullable(),
  // Señales del scraper que alimentan el pitch personalizado.
  google_rating: z.number().nullable().optional(),
  google_resenas: z.number().nullable().optional(),
  score: z.number().min(1).max(10).nullable(),
  estado: EstadoLeadSchema,
  razon_perdida: z.enum(['precio', 'sin_respuesta', 'competencia', 'sin_interes', 'otro']).nullable(),
  responsable_id: z.string().uuid().nullable(),
  origen: z.enum(['scraper', 'manual', 'referido']),
  ultimo_contacto: z.string().nullable(),
  notas: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const LeadBaseSchema = z.object({
  nombre_negocio: z.string().min(1, 'El nombre es requerido'),
  telefono: z.string().nullable().optional(),
  email: z.string().email('Correo inválido').nullable().optional().or(z.literal('')),
  nombre_contacto: z.string().nullable().optional(),
  info_texto: z.string().nullable().optional(),
  redes_sociales: z.record(z.string(), z.string()).nullable().optional(),
  tiene_web: z.boolean().nullable().optional(),
  url_web: z.string().nullable().optional(),
  nicho: z.string().nullable().optional(),
  localidad: z.string().nullable().optional(),
  score: z.number().min(1).max(10).nullable().optional(),
  estado: EstadoLeadSchema.default('sin_contactar'),
  razon_perdida: z.enum(['precio', 'sin_respuesta', 'competencia', 'sin_interes', 'otro']).nullable().optional(),
  responsable_id: z.string().uuid().nullable().optional(),
  origen: z.enum(['scraper', 'manual', 'referido']).default('manual'),
  notas: z.string().nullable().optional(),
})

// Antes solo el form y el kanban obligaban la razón al marcar "perdido" —
// cualquier otro caller de estas rutas (script, agente, curl) podía dejarla
// en null. El refine lo mueve al schema para que sea imposible de saltear.
function exigeRazonSiPerdido(data: { estado?: string; razon_perdida?: string | null }) {
  return data.estado !== 'perdido' || !!data.razon_perdida
}

export const LeadInsertSchema = LeadBaseSchema.refine(exigeRazonSiPerdido, {
  message: 'Los leads perdidos requieren una razón',
  path: ['razon_perdida'],
})

export const LeadUpdateSchema = LeadBaseSchema.partial().refine(exigeRazonSiPerdido, {
  message: 'Los leads perdidos requieren una razón',
  path: ['razon_perdida'],
})

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

export const ESTADOS_LEAD: readonly { id: EstadoLead; label: string; color: string }[] = [
  { id: 'sin_contactar', label: 'Sin contactar', color: '#94a3b8' },
  { id: 'contactado', label: 'Contactado', color: '#60a5fa' },
  { id: 'interesado', label: 'Interesado', color: '#f59e0b' },
  { id: 'reunion_agendada', label: 'Reunión agendada', color: '#a78bfa' },
  { id: 'ganado', label: 'Ganado', color: '#22c55e' },
  { id: 'perdido', label: 'Perdido', color: '#f87171' },
  { id: 'descartado', label: 'Descartado', color: '#737373' },
]

/** Etiqueta visible de un estado. */
export function etiquetaEstadoLead(estado: EstadoLead): string {
  return ESTADOS_LEAD.find((e) => e.id === estado)?.label ?? estado
}

export const RAZONES_PERDIDA = [
  { id: 'precio', label: 'Precio' },
  { id: 'sin_respuesta', label: 'Dejó de responder' },
  { id: 'competencia', label: 'Eligió competencia' },
  { id: 'sin_interes', label: 'Sin interés real' },
  { id: 'otro', label: 'Otro' },
] as const
