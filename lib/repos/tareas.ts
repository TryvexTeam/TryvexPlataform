import { createClient } from '@/lib/supabase/server'
import type { TareaInsert, TareaUpdate, TareaConResponsables, Subtarea } from '@/lib/types/tarea'

type SupabaseTarea = {
  id: string
  titulo: string
  descripcion: string | null
  tipo: 'error' | 'feature' | 'pulir' | 'general'
  estado: 'sin_empezar' | 'en_curso' | 'listo'
  prioridad: 'alta' | 'media' | 'baja'
  esfuerzo: 'pequeno' | 'medio' | 'grande'
  fecha_limite: string | null
  proyecto_id: string | null
  cliente_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
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
    responsables: { integrante_id: string; nombre: string; color: string | null }[]
  }[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('tareas')
      .select(`id, titulo, estado, prioridad, fecha_limite, tarea_responsables ( integrante_id, dim_integrantes ( nombre, color ) )`)
      .gte('fecha_limite', desde)
      .lt('fecha_limite', hasta)
      .neq('estado', 'listo')
      .order('fecha_limite', { ascending: true })
    if (error) throw new Error(error.message)
    type Row = {
      id: string; titulo: string; estado: string; prioridad: string; fecha_limite: string
      tarea_responsables: { integrante_id: string; dim_integrantes: { nombre: string; color: string | null } | null }[] | null
    }
    return ((data ?? []) as Row[]).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      fecha_limite: t.fecha_limite,
      responsables: (t.tarea_responsables ?? []).map((r) => ({
        integrante_id: r.integrante_id,
        nombre: r.dim_integrantes?.nombre ?? '',
        color: r.dim_integrantes?.color ?? null,
      })),
    }))
  }

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
      .order('created_at', { ascending: false })

    if (filters?.estado) query = query.eq('estado', filters.estado)
    if (filters?.prioridad) query = query.eq('prioridad', filters.prioridad)
    if (filters?.proyecto_id) query = query.eq('proyecto_id', filters.proyecto_id)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ((data ?? []) as SupabaseTarea[]).map(mapTarea)
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

  async cambiarEstado(id: string, estado: 'sin_empezar' | 'en_curso' | 'listo'): Promise<void> {
    const update: Record<string, string | null> = {
      estado,
      updated_at: new Date().toISOString(),
      completed_at: estado === 'listo' ? new Date().toISOString() : null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).from('tareas').update(update).eq('id', id)
    if (error) throw new Error(error.message)
  }

  async delete(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).from('tareas').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async setResponsables(tareaId: string, integranteIds: string[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = this.supabase as any
    await sb.from('tarea_responsables').delete().eq('tarea_id', tareaId)
    if (integranteIds.length === 0) return
    const { error } = await sb.from('tarea_responsables').insert(
      integranteIds.map((id) => ({ tarea_id: tareaId, integrante_id: id }))
    )
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

  async createSubtarea(data: { tarea_id: string; descripcion: string; orden?: number }): Promise<Subtarea> {
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
}
