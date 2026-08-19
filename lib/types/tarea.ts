import { z } from 'zod'

/**
 * Los cinco estados del tablero, en orden de avance.
 *
 * Los identificadores no coinciden con lo que se ve en pantalla: `sin_empezar`
 * se muestra como "Por hacer" y `listo` como "Hecho". Se conservaron al ampliar
 * el tablero a cinco columnas (migración 055) porque había 39 referencias
 * repartidas por la app y renombrarlas solo por la etiqueta era regalar riesgo.
 * Lo que se ve es cosa de la interfaz; lo que se guarda no tiene por qué
 * moverse. `ESTADOS_TAREA` es la fuente de las etiquetas.
 */
export const EstadoTareaSchema = z.enum([
  'backlog',
  'sin_empezar',
  'en_curso',
  'en_revision',
  'listo',
])

export type EstadoTarea = z.infer<typeof EstadoTareaSchema>

/** Columnas del tablero, en orden, con la etiqueta que ve el equipo. */
export const ESTADOS_TAREA: { id: EstadoTarea; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'sin_empezar', label: 'Por hacer' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'en_revision', label: 'En revisión' },
  { id: 'listo', label: 'Hecho' },
]

/** Etiqueta visible de un estado. */
export function etiquetaEstado(estado: EstadoTarea): string {
  return ESTADOS_TAREA.find((e) => e.id === estado)?.label ?? estado
}

export const TareaSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1),
  descripcion: z.string().nullable(),
  tipo: z.enum(['error', 'feature', 'pulir', 'general']),
  estado: EstadoTareaSchema,
  prioridad: z.enum(['alta', 'media', 'baja']),
  esfuerzo: z.enum(['pequeno', 'medio', 'grande']),
  fecha_limite: z.string().nullable(),
  /** Hora de Santiago 'HH:MM' o 'HH:MM:SS'; null = vence ese día sin hora fija. */
  hora_limite: z.string().nullable(),
  proyecto_id: z.string().uuid().nullable(),
  cliente_id: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  eliminado_at: z.string().nullable(),
})

export const TareaInsertSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().optional().nullable(),
  tipo: z.enum(['error', 'feature', 'pulir', 'general']).default('general'),
  estado: EstadoTareaSchema.default('sin_empezar'),
  prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
  esfuerzo: z.enum(['pequeno', 'medio', 'grande']).default('medio'),
  fecha_limite: z.string().nullable().optional(),
  hora_limite: z.string().nullable().optional(),
  proyecto_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  // No es columna de `tareas`: se persiste en tarea_responsables vía setResponsables
  responsables_ids: z.array(z.string().uuid()).optional(),
})

export const TareaUpdateSchema = TareaInsertSchema.partial()

export const SubtareaInsertSchema = z.object({
  tarea_id: z.string().uuid(),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  orden: z.number().optional(),
})

export type Tarea = z.infer<typeof TareaSchema>
export type TareaInsert = z.infer<typeof TareaInsertSchema>
export type TareaUpdate = z.infer<typeof TareaUpdateSchema>

export type TareaConResponsables = Tarea & {
  responsables: { integrante_id: string; nombre: string; avatar_url: string | null }[]
}

export type Subtarea = {
  id: string
  tarea_id: string
  descripcion: string
  completada: boolean
  orden: number | null
  completed_at: string | null
}
