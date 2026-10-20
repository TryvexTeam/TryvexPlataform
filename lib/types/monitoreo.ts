/** Tipos del monitoreo de SaaS (migración 126). */

export const TIPOS_ALERTA_SAAS = [
  'SEAL_CHANGED',
  'REVENUE_DECREASED',
  'ANNULMENTS_SPIKE',
  'SAAS_DOWN',
  'SCHEMA_BEHIND',
] as const

export type TipoAlertaSaas = (typeof TIPOS_ALERTA_SAAS)[number]

export const ETIQUETA_ALERTA: Record<TipoAlertaSaas, string> = {
  SEAL_CHANGED: 'Un mes cerrado cambió de sello',
  REVENUE_DECREASED: 'Bajó el total registrado de un mes cerrado',
  ANNULMENTS_SPIKE: 'Anulaciones sobre el 20 % de lo registrado',
  SAAS_DOWN: 'El SaaS no responde (3 intentos seguidos)',
  SCHEMA_BEHIND: 'La base del SaaS va atrasada respecto de main',
}

export interface AlertaNueva {
  tipo: TipoAlertaSaas
  /** Qué se alerta; junto al tipo deduplica alertas abiertas. */
  clave: string
  detalle: Record<string, unknown>
}

export interface SaasMonitoreado {
  id: string
  proyecto_id: string
  base_url: string
  token_env: string
  porcentaje_tryvex: number
  schema_esperado: string | null
  activo: boolean
  created_at: string
}

export interface SaasSnapshot {
  id: string
  saas_id: string
  tomado_en: string
  http_status: number
  payload: unknown
  error: string | null
}

export interface SaasAlerta {
  id: string
  saas_id: string
  tipo: TipoAlertaSaas
  clave: string
  detalle: Record<string, unknown>
  creada_en: string
  resuelta_en: string | null
}

/** Una fila de la tabla de comisión: mes + moneda, todas las organizaciones sumadas. */
export interface FilaComision {
  mes: string
  moneda: string
  cerrado: boolean
  pagos: number
  anulaciones: number
  /** Decimales exactos como texto. */
  registrado: string
  anulado: string
  comision: string
}

export type EstadoSello = 'abierto' | 'intacto' | 'cambiado'

export interface FilaMonitoreo extends FilaComision {
  sello: EstadoSello
}

/** Lo que necesita la sección "Monitoreo" del detalle de proyecto. */
export interface VistaMonitoreo {
  saas: Pick<SaasMonitoreado, 'id' | 'base_url' | 'porcentaje_tryvex' | 'activo'>
  ultimoPull: { tomado_en: string; http_status: number; error: string | null } | null
  ultimoOk: { tomado_en: string; version: string | null; schema_version: string | null } | null
  filas: FilaMonitoreo[]
  alertas: SaasAlerta[]
}
