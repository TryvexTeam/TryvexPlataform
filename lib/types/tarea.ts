import { z } from 'zod'

export const TareaSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1),
  descripcion: z.string().nullable(),
  tipo: z.enum(['error', 'feature', 'pulir', 'general']),
  estado: z.enum(['sin_empezar', 'en_curso', 'listo']),
  prioridad: z.enum(['alta', 'media', 'baja']),
  esfuerzo: z.enum(['pequeno', 'medio', 'grande']),
  fecha_limite: z.string().nullable(),
  proyecto_id: z.string().uuid().nullable(),
  cliente_id: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
})

export const TareaInsertSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().optional().nullable(),
  tipo: z.enum(['error', 'feature', 'pulir', 'general']).default('general'),
  estado: z.enum(['sin_empezar', 'en_curso', 'listo']).default('sin_empezar'),
  prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
  esfuerzo: z.enum(['pequeno', 'medio', 'grande']).default('medio'),
  fecha_limite: z.string().nullable().optional(),
  proyecto_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
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
