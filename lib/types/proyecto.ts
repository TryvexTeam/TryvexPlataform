import { z } from 'zod'

export const ProyectoInsertSchema = z.object({
  cliente_id: z.string().uuid().nullable().optional(),
  nombre: z.string().min(1, 'El nombre es requerido'),
  tipo: z.enum(['landing', 'automatizacion', 'mantencion', 'otro']),
  estado: z.enum(['brief', 'desarrollo', 'revision', 'entregado', 'mantencion', 'cerrado']).default('brief'),
  stack: z.array(z.string()).nullable().optional(),
  horas_estimadas: z.number().nullable().optional(),
  horas_reales: z.number().nullable().optional(),
  costo_total_usd: z.number().nullable().optional(),
  url_deploy: z.string().nullable().optional(),
  repo_url: z.string().nullable().optional(),
  fecha_inicio: z.string().nullable().optional(),
  fecha_entrega: z.string().nullable().optional(),
  responsable_id: z.string().uuid().nullable().optional(),
})

export const ProyectoUpdateSchema = ProyectoInsertSchema.partial()

export type ProyectoInsert = z.infer<typeof ProyectoInsertSchema>
export type ProyectoUpdate = z.infer<typeof ProyectoUpdateSchema>

export type Proyecto = {
  id: string
  cliente_id: string | null
  nombre: string
  tipo: 'landing' | 'automatizacion' | 'mantencion' | 'otro'
  estado: 'brief' | 'desarrollo' | 'revision' | 'entregado' | 'mantencion' | 'cerrado'
  stack: string[] | null
  horas_estimadas: number | null
  horas_reales: number | null
  costo_total_usd: number | null
  url_deploy: string | null
  repo_url: string | null
  fecha_inicio: string | null
  fecha_entrega: string | null
  responsable_id: string | null
  created_at: string
  updated_at: string
  cliente?: { nombre_negocio: string } | null
}

export type Venta = {
  id: string
  cliente_id: string | null
  proyecto_id: string | null
  tipo: 'inicial' | 'mantencion' | 'extra'
  monto_usd: number | null
  monto_clp: number | null
  estado_pago: 'pendiente' | 'pagado' | 'atrasado' | 'cancelado'
  fecha_emision: string | null
  fecha_pago: string | null
  metodo_pago: 'mercadopago' | 'transferencia' | 'otro' | null
  referencia: string | null
  created_at: string
}

export const ESTADOS_PROYECTO = [
  { id: 'brief', label: 'Brief', color: '#94a3b8' },
  { id: 'desarrollo', label: 'Desarrollo', color: '#60a5fa' },
  { id: 'revision', label: 'Revisión', color: '#f59e0b' },
  { id: 'entregado', label: 'Entregado', color: '#a78bfa' },
  { id: 'mantencion', label: 'Mantención', color: '#34d399' },
  { id: 'cerrado', label: 'Cerrado', color: '#6b7280' },
] as const
