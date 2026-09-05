import { createClient } from '@/lib/supabase/server'
import type { TareaInsert, TareaUpdate, TareaConResponsables, Subtarea, EstadoTarea } from '@/lib/types/tarea'
import { agruparProgresoSubtareas, type MapaProgreso } from '@/lib/utils/progreso-subtareas'

/** La tarea padre de una subtarea no existe o está en la papelera. */
export class TareaPadreInvalidaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TareaPadreInvalidaError'
  }
}

type SupabaseTarea = {
  id: string
  titulo: string
  descripcion: string | null
  tipo: 'error' | 'feature' | 'pulir' | 'general'
  estado: EstadoTarea
  prioridad: 'alta' | 'media' | 'baja'
  esfuerzo: 'pequeno' | 'medio' | 'grande'
  fecha_limite: string | null
  hora_limite: string | null
  proyecto_id: string | null
  cliente_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  eliminado_at: string | null
  tarea_responsables: {
    integrante_id: string
    dim_integrantes: { nombre: string; avatar_url: string | null } | null
  }[]
}

function mapTarea(t: SupabaseTarea): TareaConResponsables {
  return {
    ...t,
    responsables: (t.tarea_responsables ?? []).map((r) => ({
      integrante_id: r.integrante_id,
      nombre: r.dim_integrantes?.nombre ?? '',
      avatar_url: r.dim_integrantes?.avatar_url ?? null,
    })),
  }
}

export class TareasRepository {
  private supabase: Awaited<ReturnType<typeof createClient>>

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.supabase = supabase
  }

  /** Tareas con fecha_limite dentro de un rango (para el calendario del equipo),
   *  con el color de perfil de cada responsable. */
  async listPorVencimiento(desde: string, hasta: string): Promise<{
    id: string
    titulo: string
    estado: string
    prioridad: string
    fecha_limite: string
    /** 'HH:MM:SS' de Santiago; null = vence ese día sin hora fija. */
    hora_limite: string | null
    responsables: { integrante_id: string; nombre: string; color: string | null }[]
  }[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('tareas')
      .select(`id, titulo, estado, prioridad, fecha_limite, hora_limite, tarea_responsables ( integrante_id, dim_integrantes ( nombre, color ) )`)
      .gte('fecha_limite', desde)
      .lt('fecha_limite', hasta)
      .neq('estado', 'listo')
      .order('fecha_limite', { ascending: true })
    if (error) throw new Error(error.message)
    type Row = {
      id: string; titulo: string; estado: string; prioridad: string; fecha_limite: string
      hora_limite: string | null
      tarea_responsables: { integrante_id: string; dim_integrantes: { nombre: string; color: string | null } | null }[] | null
    }
    return ((data ?? []) as Row[]).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      fecha_limite: t.fecha_limite,
      hora_limite: t.hora_limite,
      responsables: (t.tarea_responsables ?? []).map((r) => ({
        integrante_id: r.integrante_id,
        nombre: r.dim_integrantes?.nombre ?? '',
        color: r.dim_integrantes?.color ?? null,
      })),
    }))
  }

  /**
   * Cuantas tareas estan vencidas (fecha limite pasada y sin cerrar).
   *
   * Se agrego para el Panel de Mando (PRP-008 fase 5.1): antes el dashboard traia
   * todas las tareas y filtraba en JS. `integranteId` acota a las mias via la
   * tabla puente `tarea_responsables`, que es la unica relacion real de responsables.
   */
  async contarVencidas(hoyISO: string, integranteId?: string): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('tareas')
      .select(
        integranteId ? 'id, tarea_responsables!inner ( integrante_id )' : 'id',
        { count: 'exact', head: true },
      )
      .is('eliminado_at', null)
      .neq('estado', 'listo')
      .not('fecha_limite', 'is', null)
      .lt('fecha_limite', hoyISO)

    if (integranteId) query = query.eq('tarea_responsables.integrante_id', integranteId)

    const { count, error } = await query
    if (error) throw new Error(error.message)
    return (count ?? 0) as number
  }

  /**
   * Tareas activas (sin cerrar ni eliminar) agrupadas por prioridad.
   *
   * Se agrego para el Panel de Mando (PRP-008 fase 5.2): el KPI "carga de
   * trabajo" (T-003 §5 #21) es un conteo por prioridad, y traerlo con
   * `list()` implicaria cargar tareas completas + responsables para
   * filtrarlas en JS. Se piden solo `prioridad` y se agrupa aca mismo.
   * `integranteId` acota a las mias via `tarea_responsables!inner`,
   * exactamente como `contarVencidas`.
   */
  async contarActivasPorPrioridad(
    integranteId?: string,
  ): Promise<{ alta: number; media: number; baja: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('tareas')
      .select(
        integranteId ? 'prioridad, tarea_responsables!inner ( integrante_id )' : 'prioridad',
      )
      .is('eliminado_at', null)
      .neq('estado', 'listo')

    if (integranteId) query = query.eq('tarea_responsables.integrante_id', integranteId)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const conteo = { alta: 0, media: 0, baja: 0 }
    for (const fila of (data ?? []) as { prioridad: 'alta' | 'media' | 'baja' }[]) {
      if (fila.prioridad in conteo) conteo[fila.prioridad] += 1
    }
    return conteo
  }

  /**
   * Tareas activas que hay que mirar hoy, mas urgente primero.
   *
   * Es la seccion "Tus tareas de hoy" del Panel de Mando. El orden es lo que
   * aporta: primero lo vencido (fecha mas antigua arriba), despues lo que
   * vence pronto, y las sin fecha al final — una tarea sin plazo no compite
   * con una que se paso hace cuatro dias.
   *
   * Postgres ordena NULLS LAST en ascendente por defecto, asi que las sin
   * fecha caen solas al fondo sin inventarles un plazo.
   *
   * `integranteId` acota a las mias via `tarea_responsables!inner`, igual que
   * `contarVencidas`. Ojo: ese filtro tambien recorta los responsables
   * embebidos a esa persona, asi que la vista propia no debe pintarlos como
   * si fueran la lista completa.
   */
  async listDelDia(integranteId: string | undefined, limite: number): Promise<TareaConResponsables[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('tareas')
      .select(
        integranteId
          ? `*, tarea_responsables!inner ( integrante_id, dim_integrantes ( nombre, avatar_url ) )`
          : `*, tarea_responsables ( integrante_id, dim_integrantes ( nombre, avatar_url ) )`,
      )
      .is('eliminado_at', null)
      .neq('estado', 'listo')
      .order('fecha_limite', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limite)

    if (integranteId) query = query.eq('tarea_responsables.integrante_id', integranteId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ((data ?? []) as SupabaseTarea[]).map(mapTarea)
  }

  /** Tareas activas del kanban. La papelera vive aparte (ver `listPapelera`). */
  async list(filters?: {
    estado?: string
    prioridad?: string
    responsable_id?: string
    proyecto_id?: string
  }): Promise<TareaConResponsables[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('tareas')
      .select(`*, tarea_responsables ( integrante_id, dim_integrantes ( nombre, avatar_url ) )`)
      .is('eliminado_at', null)
      .order('created_at', { ascending: false })

    if (filters?.estado) query = query.eq('estado', filters.estado)
    if (filters?.prioridad) query = query.eq('prioridad', filters.prioridad)
    if (filters?.proyecto_id) query = query.eq('proyecto_id', filters.proyecto_id)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ((data ?? []) as SupabaseTarea[]).map(mapTarea)
  }

  /** Tareas en la papelera, mas recientes primero. Conservan estado, fecha
   *  limite, responsables y subtareas tal cual estaban al momento de borrarlas. */
  async listPapelera(): Promise<TareaConResponsables[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('tareas')
      .select(`*, tarea_responsables ( integrante_id, dim_integrantes ( nombre, avatar_url ) )`)
      .not('eliminado_at', 'is', null)
      .order('eliminado_at', { ascending: false })

    if (error) throw new Error(error.message)
    return ((data ?? []) as SupabaseTarea[]).map(mapTarea)
  }

  /** Mueve la tarea a la papelera sin tocar su estado ni nada mas: es reversible. */
  async moverAPapelera(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('tareas')
      .update({ eliminado_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  /** Saca la tarea de la papelera. Si viene de arrastrarla a una columna del
   *  kanban, `estado` fija donde queda; si no, conserva el estado que tenia. */
  async restaurar(id: string, estado?: EstadoTarea): Promise<void> {
    const update: Record<string, string | null> = { eliminado_at: null }
    if (estado) update.estado = estado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).from('tareas').update(update).eq('id', id)
    if (error) throw new Error(error.message)
  }

  async getById(id: string): Promise<TareaConResponsables | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('tareas')
      .select(`*, tarea_responsables ( integrante_id, dim_integrantes ( nombre, avatar_url ) )`)
      .eq('id', id)
      .single()

    if (error || !data) return null
    return mapTarea(data as SupabaseTarea)
  }

  /** Mapea auth user id → id de integrante activo (created_by es FK a dim_integrantes) */
  async integranteIdDe(authUserId: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (this.supabase as any)
      .from('dim_integrantes')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('activo', true)
      .maybeSingle()
    return (data as { id: string } | null)?.id ?? null
  }

  async create(data: TareaInsert, createdBy: string | null): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (this.supabase as any)
      .from('tareas')
      .insert({ ...data, created_by: createdBy })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return (row as { id: string }).id
  }

  async update(id: string, data: TareaUpdate): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('tareas')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(error.message)
  }

  async cambiarEstado(id: string, estado: EstadoTarea): Promise<void> {
    // `completada_at` (columna real) la mantiene el disparador de la base
    // (migración 060); acá solo se toca `updated_at`.
    const update: Record<string, string | null> = {
      estado,
      updated_at: new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).from('tareas').update(update).eq('id', id)
    if (error) throw new Error(error.message)
  }

  /** Borrado real e irreversible. Solo se llama desde la papelera. */
  async delete(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).from('tareas').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /**
   * Reemplaza los responsables de la tarea en un solo paso atómico.
   *
   * Antes era delete() + insert() como dos llamadas de PostgREST: si el insert
   * fallaba, la tarea quedaba sin nadie asignado y sin rollback. `set_tarea_responsables`
   * (migración 063) hace ambas dentro de la misma transacción SQL.
   */
  async setResponsables(tareaId: string, integranteIds: string[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = this.supabase as any
    const { error } = await sb.rpc('set_tarea_responsables', {
      p_tarea_id: tareaId,
      p_integrante_ids: integranteIds,
    })
    if (error) throw new Error(error.message)
  }

  async listSubtareas(tareaId: string): Promise<Subtarea[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('subtareas')
      .select('*')
      .eq('tarea_id', tareaId)
      .order('orden', { ascending: true })

    if (error) throw new Error(error.message)
    return (data ?? []) as Subtarea[]
  }

  /**
   * Avance de los pasos de VARIAS tareas en una sola consulta.
   *
   * Es para el tablero: cada tarjeta quiere mostrar "3/8", y pedirlo con un
   * `listSubtareas` por tarjeta serían decenas de viajes a la base por cada
   * carga del kanban (el N+1 de siempre). Acá se pide una sola vez `tarea_id` +
   * `completada` —nada de descripciones, que el tablero no las pinta— y se
   * agrupa en memoria.
   *
   * Sin `tareaIds` trae el avance de todas las tareas. Con la lista, PostgREST
   * arma un `IN (...)`; se corta el `in` vacío antes de salir porque un `IN ()`
   * es una consulta que no puede devolver nada y no vale gastarla.
   */
  async progresoSubtareas(tareaIds?: string[]): Promise<MapaProgreso> {
    if (tareaIds && tareaIds.length === 0) return {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any).from('subtareas').select('tarea_id, completada')
    if (tareaIds) query = query.in('tarea_id', tareaIds)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return agruparProgresoSubtareas((data ?? []) as { tarea_id: string; completada: boolean }[])
  }

  async createSubtarea(data: { tarea_id: string; descripcion: string; orden?: number }): Promise<Subtarea> {
    // Sin esto, una subtarea puede quedar colgando de una tarea que no existe
    // o que ya está en la papelera (borrado suave): el formulario no la vuelve
    // a mostrar en ningún lado, pero la fila sigue viva en la base.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tarea, error: tareaError } = await (this.supabase as any)
      .from('tareas')
      .select('id, eliminado_at')
      .eq('id', data.tarea_id)
      .maybeSingle()

    if (tareaError) throw new Error(tareaError.message)
    if (!tarea) throw new TareaPadreInvalidaError('La tarea padre no existe')
    if (tarea.eliminado_at !== null) {
      throw new TareaPadreInvalidaError('La tarea padre está en la papelera')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (this.supabase as any)
      .from('subtareas')
      .insert({ ...data, completada: false })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return row as Subtarea
  }

  async toggleSubtarea(id: string, completada: boolean): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('subtareas')
      .update({ completada, completed_at: completada ? new Date().toISOString() : null })
      .eq('id', id)

    if (error) throw new Error(error.message)
  }

  async deleteSubtarea(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).from('subtareas').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /**
   * Cuántas tareas terminó cada persona en el periodo.
   *
   * Se apoya en `completada_at`, que mantiene un disparador de la base: contar
   * por `updated_at` haría figurar como trabajo de esta semana una tarea
   * cerrada hace meses y retocada hoy.
   *
   * Una tarea con dos responsables suma para los dos. No se reparte a medias
   * porque nadie hizo media tarea, y el marcador mide participación, no
   * facturación.
   */
  async contarCompletadasPorIntegrante(
    desdeISO: string,
    hastaISO: string,
  ): Promise<Map<string, number>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('tareas')
      .select('id, tarea_responsables ( integrante_id )')
      .eq('estado', 'listo')
      .is('eliminado_at', null)
      .gte('completada_at', desdeISO)
      .lte('completada_at', hastaISO)
    if (error) throw new Error(error.message)

    const conteo = new Map<string, number>()
    for (const fila of (data ?? []) as { tarea_responsables: { integrante_id: string }[] | null }[]) {
      for (const responsable of fila.tarea_responsables ?? []) {
        conteo.set(responsable.integrante_id, (conteo.get(responsable.integrante_id) ?? 0) + 1)
      }
    }
    return conteo
  }

}
