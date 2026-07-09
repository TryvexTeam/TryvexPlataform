import { z } from 'zod'

/** Celda de 1 hora: dia_semana 0=lunes ... 6=domingo · hora 0-23 */
export const CeldaSchema = z.object({
  dia_semana: z.number().int().min(0).max(6),
  hora: z.number().int().min(0).max(23),
})

export const DisponibilidadPutSchema = z.object({
  celdas: z.array(CeldaSchema).max(168),
})

export type Celda = z.infer<typeof CeldaSchema>

export interface DisponibilidadIntegrante {
  integrante_id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  es_propio: boolean
  celdas: Celda[]
}

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
