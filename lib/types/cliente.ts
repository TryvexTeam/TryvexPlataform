import { z } from 'zod'

export const ClienteInsertSchema = z.object({
  nombre_contacto: z.string().min(1, 'El nombre del cliente es requerido'),
  nombre_negocio: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  nicho: z.string().nullable().optional(),
  localidad: z.string().nullable().optional(),
  redes_sociales: z.record(z.string(), z.string()).nullable().optional(),
  fecha_cierre: z.string().nullable().optional(),
  valor_inicial_usd: z.number().nullable().optional(),
  mantencion_mensual_usd: z.number().nullable().optional(),
  estado: z.enum(['activo', 'pausado', 'cancelado']).default('activo'),
  notas: z.string().nullable().optional(),
  /** Da por cerrado el saldo del valor inicial sin borrar lo acordado (migración 030). */
  saldo_inicial_saldado: z.boolean().optional(),
})

export const ClienteUpdateSchema = ClienteInsertSchema.partial()

export type ClienteInsert = z.infer<typeof ClienteInsertSchema>
export type ClienteUpdate = z.infer<typeof ClienteUpdateSchema>

export type Cliente = {
  id: string
  nombre_negocio: string | null
  nombre_contacto: string | null
  telefono: string | null
  email: string | null
  nicho: string | null
  localidad: string | null
  redes_sociales: Record<string, string> | null
  fecha_cierre: string | null
  valor_inicial_usd: number | null
  mantencion_mensual_usd: number | null
  estado: 'activo' | 'pausado' | 'cancelado'
  notas: string | null
  saldo_inicial_saldado: boolean
  created_at: string
  updated_at: string
}

/** Nombre principal a mostrar: la persona; fallback al negocio para datos antiguos */
export function nombreCliente(c: { nombre_contacto?: string | null; nombre_negocio?: string | null }): string {
  return c.nombre_contacto || c.nombre_negocio || 'Sin nombre'
}
