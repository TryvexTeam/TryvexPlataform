import { z } from 'zod'

export const SaludarSchema = z.object({ nuevo_id: z.string().uuid() })

export type Saludo = {
  id: string
  nombre: string
  avatar_url: string | null
  created_at: string
}

export type RecienLlegado = {
  id: string
  nombre: string
  avatar_url: string | null
  llegada_anunciada_at: string
  saludos: Saludo[]
}

export type ResultadoSaludo = { conversacion_id: string; ya_saludado: boolean }
