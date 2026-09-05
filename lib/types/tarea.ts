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

/**
 * Actualizar una tarea NO es crearla de nuevo.
 *
 * `.partial()` hace opcional cada campo, pero **no quita los `.default()`**: si
 * el cuerpo del PATCH no trae `tipo`, Zod igual devuelve `'general'`, y esa
 * pasada a la base pisa lo que hubiera. Un PATCH que solo cambia la fecha
 * límite terminaba reseteando tipo, estado, prioridad y esfuerzo a los valores
 * de fábrica, en silencio y con 200.
 *
 * Pasó de verdad el 5-sep: al repartir cuatro tareas del tablero, las cuatro
 * volvieron a «General / Media / M» y hubo que restaurarlas a mano. Nadie se
 * habría enterado salvo por mirar el tablero después.
 *
 * `.omit()` antes de `.partial()` saca los defaults del medio: los campos
 * siguen aceptándose, pero solo se escriben cuando vienen de verdad.
 */
export const TareaUpdateSchema = TareaInsertSchema.omit({
  tipo: true,
  estado: true,
  prioridad: true,
  esfuerzo: true,
})
  .partial()
  .extend({
    tipo: TareaInsertSchema.shape.tipo.removeDefault().optional(),
    estado: TareaInsertSchema.shape.estado.removeDefault().optional(),
    prioridad: TareaInsertSchema.shape.prioridad.removeDefault().optional(),
    esfuerzo: TareaInsertSchema.shape.esfuerzo.removeDefault().optional(),
  })

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
