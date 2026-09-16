import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { AgenteSala, Encargo, Evidencia } from '@/lib/types/sala-agentes'

export class SalaAgentesRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async listarAgentes(): Promise<AgenteSala[]> {
    const { data, error } = await this.sb
      .from('agentes')
      .select('id, nombre, descripcion, color, activo, ultimo_uso_at')
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .returns<Pick<Database['public']['Tables']['agentes']['Row'],
        'id' | 'nombre' | 'descripcion' | 'color' | 'activo' | 'ultimo_uso_at'>[]>()

    if (error) throw new Error(error.message)

    const ahora = Date.now()
    return (data ?? []).map((agente): AgenteSala => {
      const ultimoUso = agente.ultimo_uso_at === null
        ? NaN
        : Date.parse(agente.ultimo_uso_at)

      // NO VERIFICADO: tareas.agente_id. La 014 enlaza ejecutado_por con
      // dim_integrantes, NO con agentes (024). No equiparar sus UUID ni nombres.
      // Sin ese vínculo no se pueden atribuir tareas, estados ni conteos.
      return {
        id: agente.id,
        nombre: agente.nombre,
        oficio: agente.descripcion ?? '',
        color: agente.color ?? 'var(--tx-ink-muted)',
        estado: !Number.isFinite(ultimoUso) || ahora - ultimoUso > 15 * 60 * 1000
          ? 'sin_latido'
          : 'en_reposo',
        haciendo: 'Sin trabajo asignado.',
        // NO VERIFICADO: agentes.humano.
        humano: null,
        encargosHoy: 0,
        // NO VERIFICADO: agentes.proxima_rutina. La tabla rutinas no existe.
        proximaRutina: null,
      }
    })
  }

  async listarEncargos(limite = 20): Promise<Encargo[]> {
    const { data, error } = await this.sb
      .from('tareas')
      .select('id, titulo, estado, requiere_firma_humana')
      .order('updated_at', { ascending: false })
      .limit(limite)
      .returns<(Pick<Encargo, 'id' | 'titulo' | 'estado'> & {
        requiere_firma_humana: Encargo['requiereFirma']
      })[]>()

    if (error) throw new Error(error.message)
    if (!data?.length) return []

    const { data: pruebas, error: errorPruebas } = await this.sb
      .from('tarea_evidencias')
      .select('tarea_id, tipo, descripcion, payload')
      .in('tarea_id', data.map((tarea) => tarea.id))
      .returns<(Pick<Evidencia, 'tipo'> & {
        tarea_id: Encargo['id']
        descripcion: string | null
        payload: string
      })[]>()

    if (errorPruebas) throw new Error(errorPruebas.message)

    const evidencias = new Map<Encargo['id'], Evidencia[]>()
    for (const prueba of pruebas ?? []) {
      const grupo = evidencias.get(prueba.tarea_id) ?? []
      grupo.push({
        tipo: prueba.tipo,
        resumen: (prueba.descripcion ?? prueba.payload).slice(0, 60),
      })
      evidencias.set(prueba.tarea_id, grupo)
    }

    return data.map((tarea): Encargo => ({
      id: tarea.id,
      titulo: tarea.titulo,
      // NO VERIFICADO: tareas.agente_id (ejecutado_por es un integrante).
      agenteId: '',
      estado: tarea.estado,
      evidencias: evidencias.get(tarea.id) ?? [],
      veredicto: tarea.estado === 'probada' || tarea.estado === 'listo'
        ? 'pasa'
        : tarea.estado === 'huerfana' ? 'falla' : null,
      // NO VERIFICADO: tareas.pedido_por.
      pedidoPor: '',
      requiereFirma: tarea.requiere_firma_humana,
      // NO VERIFICADO: tareas.por_que_irreversible. bloqueo_motivo no equivale
      // necesariamente a una explicación de irreversibilidad.
      porQueIrreversible: null,
    }))
  }

  async contarPendientesDeFirma(): Promise<number> {
    const { count, error } = await this.sb
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'bloqueada')
      .eq('requiere_firma_humana', true)
      .is('firmada_por', null)

    if (error) throw new Error(error.message)
    return count ?? 0
  }
}
