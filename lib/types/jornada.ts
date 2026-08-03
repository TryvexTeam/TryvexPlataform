import { z } from 'zod'

export const PausaSchema = z.object({
  inicio: z.string(),
  fin: z.string().optional(),
})

export const MarcarSchema = z.object({
  accion: z.enum(['entrada', 'salida', 'pausa', 'reanudar']),
  nota: z.string().max(500).nullable().optional(),
})

export const JornadaUpdateSchema = z.object({
  entrada_at: z.string().optional(),
  salida_at: z.string().nullable().optional(),
  nota: z.string().max(500).nullable().optional(),
})

export type Pausa = z.infer<typeof PausaSchema>
export type MarcarInput = z.infer<typeof MarcarSchema>
export type JornadaUpdate = z.infer<typeof JornadaUpdateSchema>

export type OrigenJornada = 'web' | 'pwa' | 'movil' | 'admin'

export type Jornada = {
  id: string
  integrante_id: string
  entrada_at: string
  salida_at: string | null
  pausas: Pausa[]
  nota: string | null
  origen: OrigenJornada
  created_at: string
  updated_at: string
}

/** Fila de la vista jornadas_resumen: horas ya calculadas y descontadas las pausas. */
export type JornadaResumen = {
  id: string
  integrante_id: string
  integrante_nombre: string
  integrante_email: string
  entrada_at: string
  salida_at: string | null
  nota: string | null
  origen: OrigenJornada
  fecha_local: string
  horas: number
}

/** Segundos trabajados hasta ahora, descontando pausas cerradas y la pausa en curso. */
export function segundosTrabajados(jornada: Jornada, ahora = new Date()): number {
  const fin = jornada.salida_at ? new Date(jornada.salida_at) : ahora
  const bruto = (fin.getTime() - new Date(jornada.entrada_at).getTime()) / 1000

  const pausado = (jornada.pausas ?? []).reduce((total, p) => {
    const desde = new Date(p.inicio).getTime()
    const hasta = p.fin ? new Date(p.fin).getTime() : fin.getTime()
    return total + Math.max(0, (hasta - desde) / 1000)
  }, 0)

  return Math.max(0, bruto - pausado)
}

export function formatearDuracion(segundos: number): string {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function enPausa(jornada: Jornada): boolean {
  const ultima = jornada.pausas?.[jornada.pausas.length - 1]
  return Boolean(ultima && !ultima.fin)
}
