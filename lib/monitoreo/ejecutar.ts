import 'server-only'

import { pedirMetricas } from './cliente'
import { detectarAnomalias } from './anomalias'
import { calcularComision } from './comision'
import { MetricasV1Schema, type MetricasV1 } from './esquema'
import type { MonitoreoSaasRepository } from '@/lib/repos/monitoreo-saas'
import type { FilaMonitoreo, SaasMonitoreado, VistaMonitoreo } from '@/lib/types/monitoreo'

export interface ResumenPull {
  saas_id: string
  http_status: number
  ok: boolean
  error: string | null
  alertas_nuevas: number
}

/** Un payload ya guardado se revalida al leerlo: la evidencia no se da por buena a ciegas. */
function metricasDe(payload: unknown): MetricasV1 | null {
  const r = MetricasV1Schema.safeParse(payload)
  return r.success ? r.data : null
}

/**
 * Un pull completo: pide, guarda el snapshot (también si falló), compara contra
 * el último pull válido ANTERIOR y registra alertas. El orden importa: el previo
 * se lee antes de guardar el actual.
 */
export async function monitorearSaas(
  repo: MonitoreoSaasRepository,
  saas: SaasMonitoreado,
  fetchImpl: typeof fetch = fetch,
): Promise<ResumenPull> {
  const previoSnap = await repo.ultimoSnapshotOk(saas.id)
  const pull = await pedirMetricas(saas.clave, fetchImpl)

  await repo.guardarSnapshot({
    saasId: saas.id,
    httpStatus: pull.httpStatus,
    payload: pull.crudo,
    error: pull.error,
  })

  const estados = await repo.estadosRecientes(saas.id)
  const alertas = detectarAnomalias(previoSnap ? metricasDe(previoSnap.payload) : null, pull.metricas, {
    estadosRecientes: estados,
    schemaEsperado: saas.schema_esperado,
  })
  const creadas = await repo.insertarAlertas(saas.id, alertas)
  if (pull.metricas) await repo.resolverAbiertas(saas.id, 'SAAS_DOWN')

  return {
    saas_id: saas.id,
    http_status: pull.httpStatus,
    ok: pull.metricas !== null,
    error: pull.error,
    alertas_nuevas: creadas,
  }
}

/** Datos de la sección "Monitoreo" del proyecto. Lee con el cliente de quien mira (RLS). */
export async function armarVista(repo: MonitoreoSaasRepository, proyectoId: string): Promise<VistaMonitoreo | null> {
  const saas = await repo.porProyecto(proyectoId)
  if (!saas) return null

  const [ultimo, ok, alertas] = await Promise.all([
    repo.ultimoSnapshot(saas.id),
    repo.ultimoSnapshotOk(saas.id),
    repo.alertasAbiertas(saas.id),
  ])
  const metricas = ok ? metricasDe(ok.payload) : null

  const mesesConSelloCambiado = new Set(
    alertas.filter((a) => a.tipo === 'SEAL_CHANGED').map((a) => String(a.detalle.mes ?? '')),
  )
  const filas: FilaMonitoreo[] = metricas
    ? calcularComision(metricas, saas.porcentaje_tryvex).map((f) => ({
        ...f,
        sello: !f.cerrado ? 'abierto' : mesesConSelloCambiado.has(f.mes) ? 'cambiado' : 'intacto',
      }))
    : []

  return {
    saas: { id: saas.id, clave: saas.clave, porcentaje_tryvex: saas.porcentaje_tryvex, activo: saas.activo },
    ultimoPull: ultimo ? { tomado_en: ultimo.tomado_en, http_status: ultimo.http_status, error: ultimo.error } : null,
    ultimoOk: ok && metricas
      ? { tomado_en: ok.tomado_en, version: metricas.version, schema_version: metricas.schema_version }
      : null,
    filas,
    alertas,
  }
}
