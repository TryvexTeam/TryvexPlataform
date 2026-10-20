import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlertaNueva, SaasAlerta, SaasMonitoreado, SaasSnapshot } from '@/lib/types/monitoreo'

// Tablas de la migración 126, todavía fuera de los tipos generados. El desvío
// queda en este repo para no propagar consultas sin tipos.
type ClienteSinTipos = SupabaseClient

const COLS_SAAS = 'id, proyecto_id, base_url, token_env, porcentaje_tryvex, schema_esperado, activo, created_at'
const COLS_SNAP = 'id, saas_id, tomado_en, http_status, payload, error'
const COLS_ALERTA = 'id, saas_id, tipo, clave, detalle, creada_en, resuelta_en'

/** Cuántos pulls recientes se miran para decidir si el SaaS está caído. */
const ESTADOS_RECIENTES = 10

function normalizarSaas(f: SaasMonitoreado): SaasMonitoreado {
  // NUMERIC llega como número o texto según el cliente: se fija a número.
  return { ...f, porcentaje_tryvex: Number(f.porcentaje_tryvex) }
}

export class MonitoreoSaasRepository {
  private sb: ClienteSinTipos

  constructor(supabase: SupabaseClient) {
    this.sb = supabase as ClienteSinTipos
  }

  async listarActivos(): Promise<SaasMonitoreado[]> {
    const { data, error } = await this.sb.from('saas_monitoreados').select(COLS_SAAS).eq('activo', true)
    if (error) throw new Error(`No se pudieron leer los SaaS monitoreados: ${error.message}`)
    return ((data ?? []) as SaasMonitoreado[]).map(normalizarSaas)
  }

  async porProyecto(proyectoId: string): Promise<SaasMonitoreado | null> {
    const { data, error } = await this.sb
      .from('saas_monitoreados').select(COLS_SAAS).eq('proyecto_id', proyectoId).maybeSingle()
    if (error) throw new Error(`No se pudo leer el monitoreo del proyecto: ${error.message}`)
    return data ? normalizarSaas(data as SaasMonitoreado) : null
  }

  async ultimoSnapshot(saasId: string): Promise<SaasSnapshot | null> {
    const { data, error } = await this.sb
      .from('saas_snapshots').select(COLS_SNAP).eq('saas_id', saasId)
      .order('tomado_en', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(`No se pudo leer el último pull: ${error.message}`)
    return (data as SaasSnapshot) ?? null
  }

  /** Último pull que respondió 200 con payload válido (error nulo). */
  async ultimoSnapshotOk(saasId: string): Promise<SaasSnapshot | null> {
    const { data, error } = await this.sb
      .from('saas_snapshots').select(COLS_SNAP).eq('saas_id', saasId)
      .eq('http_status', 200).is('error', null)
      .order('tomado_en', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(`No se pudo leer el último pull válido: ${error.message}`)
    return (data as SaasSnapshot) ?? null
  }

  /** Estados de los pulls más recientes, del más nuevo al más viejo (-1 = 200 inválido). */
  async estadosRecientes(saasId: string): Promise<number[]> {
    const { data, error } = await this.sb
      .from('saas_snapshots').select('http_status, error').eq('saas_id', saasId)
      .order('tomado_en', { ascending: false }).limit(ESTADOS_RECIENTES)
    if (error) throw new Error(`No se pudo leer el historial de pulls: ${error.message}`)
    return ((data ?? []) as { http_status: number; error: string | null }[])
      .map((f) => (f.http_status === 200 && f.error ? -1 : f.http_status))
  }

  async guardarSnapshot(s: { saasId: string; httpStatus: number; payload: unknown; error: string | null }): Promise<void> {
    const { error } = await this.sb.from('saas_snapshots').insert({
      saas_id: s.saasId,
      http_status: s.httpStatus,
      payload: s.payload === undefined ? null : s.payload,
      error: s.error ? s.error.slice(0, 2000) : null,
    })
    if (error) throw new Error(`No se pudo guardar el pull: ${error.message}`)
  }

  /**
   * Inserta las alertas que no estén ya abiertas. Una por una: el índice único
   * parcial (saas, tipo, clave) rechaza la repetida con 23505 y se ignora.
   * Devuelve cuántas se crearon.
   */
  async insertarAlertas(saasId: string, alertas: AlertaNueva[]): Promise<number> {
    let creadas = 0
    for (const a of alertas) {
      const { error } = await this.sb.from('saas_alertas').insert({
        saas_id: saasId, tipo: a.tipo, clave: a.clave, detalle: a.detalle,
      })
      if (!error) creadas++
      else if (error.code !== '23505') throw new Error(`No se pudo guardar la alerta: ${error.message}`)
    }
    return creadas
  }

  /** Cierra las alertas abiertas de un tipo (p. ej. SAAS_DOWN cuando vuelve a responder). */
  async resolverAbiertas(saasId: string, tipo: SaasAlerta['tipo']): Promise<void> {
    const { error } = await this.sb.from('saas_alertas')
      .update({ resuelta_en: new Date().toISOString() })
      .eq('saas_id', saasId).eq('tipo', tipo).is('resuelta_en', null)
    if (error) throw new Error(`No se pudo cerrar la alerta: ${error.message}`)
  }

  async alertasAbiertas(saasId: string): Promise<SaasAlerta[]> {
    const { data, error } = await this.sb
      .from('saas_alertas').select(COLS_ALERTA).eq('saas_id', saasId).is('resuelta_en', null)
      .order('creada_en', { ascending: false }).limit(200)
    if (error) throw new Error(`No se pudieron leer las alertas: ${error.message}`)
    return (data ?? []) as SaasAlerta[]
  }
}
