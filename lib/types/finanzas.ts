import { z } from 'zod'

/**
 * Caja de la empresa. Distinto de fact_ventas: aquello es lo que se le cobra a un
 * cliente; esto es la plata que efectivamente entró o salió.
 */

export const CATEGORIAS_INGRESO = [
  'cobro_cliente',
  'aporte_socio',
  'reembolso',
  'otro_ingreso',
] as const

export const CATEGORIAS_EGRESO = [
  'sueldo',
  'honorario',
  'herramienta',
  'infraestructura',
  'publicidad',
  'impuesto',
  'comision',
  'oficina',
  'otro_egreso',
] as const

export const CATEGORIA_LABELS: Record<string, string> = {
  cobro_cliente: 'Cobro a cliente',
  aporte_socio: 'Aporte de socio',
  reembolso: 'Reembolso',
  otro_ingreso: 'Otro ingreso',
  sueldo: 'Sueldo',
  honorario: 'Honorario',
  herramienta: 'Herramienta / software',
  infraestructura: 'Infraestructura / hosting',
  publicidad: 'Publicidad',
  impuesto: 'Impuesto',
  comision: 'Comisión bancaria',
  oficina: 'Oficina / insumos',
  otro_egreso: 'Otro egreso',
}

export const METODOS_PAGO = ['transferencia', 'efectivo', 'tarjeta', 'mercadopago', 'otro'] as const

export const METODO_LABELS: Record<string, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
}

const TODAS_CATEGORIAS = [...CATEGORIAS_INGRESO, ...CATEGORIAS_EGRESO] as unknown as [string, ...string[]]

/**
 * La forma base se declara aparte del refinamiento porque el update parcial la
 * necesita sin él: en un PATCH puede venir solo el monto, y la regla "la categoría
 * corresponde al tipo" no se puede evaluar sin los dos campos presentes.
 */
const MovimientoCamposSchema = z.object({
    tipo: z.enum(['ingreso', 'egreso']),
    categoria: z.enum(TODAS_CATEGORIAS),
    descripcion: z.string().trim().min(1, 'La descripción es requerida').max(300),
    monto_clp: z.number().positive('El monto debe ser mayor a 0').max(9_999_999_999),
    monto_usd: z.number().positive().nullable().optional(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    metodo_pago: z.enum(METODOS_PAGO).nullable().optional(),
    contraparte: z.string().trim().max(200).nullable().optional(),
    cliente_id: z.string().uuid().nullable().optional(),
    proyecto_id: z.string().uuid().nullable().optional(),
    voucher_path: z.string().max(500).nullable().optional(),
    voucher_nombre: z.string().max(300).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
})

/** La categoría tiene que corresponder al tipo: un "sueldo" que mete plata a la caja
 *  es un dato mal cargado que después desordena todo el reporte. */
function categoriaCalzaConTipo(d: { tipo: 'ingreso' | 'egreso'; categoria: string }): boolean {
  const validas = d.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO
  return (validas as readonly string[]).includes(d.categoria)
}

export const MovimientoInsertSchema = MovimientoCamposSchema.refine(categoriaCalzaConTipo, {
  message: 'Esa categoría no corresponde al tipo de movimiento',
  path: ['categoria'],
})

// En un PATCH la regla solo se puede exigir cuando vienen ambos campos.
export const MovimientoUpdateSchema = MovimientoCamposSchema.partial().refine(
  (d) => d.tipo === undefined || d.categoria === undefined || categoriaCalzaConTipo({ tipo: d.tipo, categoria: d.categoria }),
  { message: 'Esa categoría no corresponde al tipo de movimiento', path: ['categoria'] },
)

export const FiltroFinanzasSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tipo: z.enum(['ingreso', 'egreso']).optional(),
  categoria: z.string().optional(),
})

export type MovimientoInsert = z.infer<typeof MovimientoInsertSchema>
export type MovimientoUpdate = z.infer<typeof MovimientoUpdateSchema>
export type FiltroFinanzas = z.infer<typeof FiltroFinanzasSchema>

export type Movimiento = {
  id: string
  tipo: 'ingreso' | 'egreso'
  categoria: string
  descripcion: string
  monto_clp: number
  monto_usd: number | null
  fecha: string
  metodo_pago: string | null
  contraparte: string | null
  cliente_id: string | null
  proyecto_id: string | null
  venta_id: string | null
  voucher_path: string | null
  voucher_nombre: string | null
  notas: string | null
  creado_por: string | null
  created_at: string
  updated_at: string
  cliente?: { nombre_negocio: string | null } | null
}

export type ResumenFinanzas = {
  ingresos: number
  egresos: number
  saldo: number
  movimientos: number
  sinVoucher: number
}

export function resumirMovimientos(movs: Movimiento[]): ResumenFinanzas {
  const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto_clp), 0)
  const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto_clp), 0)
  return {
    ingresos,
    egresos,
    saldo: ingresos - egresos,
    movimientos: movs.length,
    sinVoucher: movs.filter((m) => !m.voucher_path).length,
  }
}

export function formatearCLP(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

/** Categorías válidas para un tipo — alimenta el selector del formulario. */
export function categoriasDe(tipo: 'ingreso' | 'egreso'): readonly string[] {
  return tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO
}
