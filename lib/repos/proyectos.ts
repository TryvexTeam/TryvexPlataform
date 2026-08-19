import { createClient } from '@/lib/supabase/server'
import type { Proyecto, ProyectoInsert, ProyectoUpdate, Venta } from '@/lib/types/proyecto'
import { plantillaDe, type IdServicio } from '@/lib/types/servicios'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class ProyectosRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  async list(filters?: { cliente_id?: string; estado?: string }): Promise<Proyecto[]> {
    let query = this.sb
      .from('dim_proyectos')
      .select('*, dim_clientes ( nombre_negocio, nombre_contacto )')
      .order('created_at', { ascending: false })

    if (filters?.cliente_id) query = query.eq('cliente_id', filters.cliente_id)
    if (filters?.estado) query = query.eq('estado', filters.estado)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return ((data ?? []) as (Proyecto & { dim_clientes:  { nombre_negocio: string | null; nombre_contacto: string | null } | null })[]).map((p) => ({
      ...p,
      cliente: p.dim_clientes,
    }))
  }

  async getById(id: string): Promise<Proyecto | null> {
    const { data, error } = await this.sb
      .from('dim_proyectos')
      .select('*, dim_clientes ( nombre_negocio, nombre_contacto )')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return { ...data, cliente: data.dim_clientes } as Proyecto
  }

  async create(data: ProyectoInsert): Promise<string> {
    const { data: row, error } = await this.sb
      .from('dim_proyectos')
      .insert(data)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (row as { id: string }).id
  }

  /**
   * Crea el proyecto y, si el servicio elegido tiene plantilla, precarga sus
   * tareas de una vez: el equipo parte con el trabajo ya desglosado en vez de
   * armarlo desde cero. Reutiliza `create` para no duplicar la lógica de inserción.
   */
  async crearConPlantilla(
    datos: ProyectoInsert,
    servicioId: string | null,
    createdBy: string | null,
  ): Promise<string> {
    const proyectoId = await this.create(datos)

    const plantilla = servicioId ? plantillaDe(servicioId as IdServicio) : undefined
    if (!plantilla) return proyectoId

    // Si este insert falla, el proyecto ya quedó creado. No se revierte a
    // propósito: es mejor un proyecto sin tareas (el usuario las agrega a mano)
    // que borrar un registro que quizá ya tiene datos asociados.
    const { error } = await this.sb.from('tareas').insert(
      plantilla.tareas.map((tarea) => ({
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        tipo: tarea.tipo,
        prioridad: tarea.prioridad,
        esfuerzo: tarea.esfuerzo,
        proyecto_id: proyectoId,
        created_by: createdBy,
        estado: 'backlog',
      })),
    )
    if (error) throw new Error(error.message)

    return proyectoId
  }

  async update(id: string, data: ProyectoUpdate): Promise<void> {
    const { error } = await this.sb
      .from('dim_proyectos')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  async cambiarEstado(id: string, estado: Proyecto['estado']): Promise<void> {
    const { error } = await this.sb
      .from('dim_proyectos')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.sb.from('dim_proyectos').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listVentas(clienteId?: string, proyectoId?: string): Promise<Venta[]> {
    let query = this.sb
      .from('fact_ventas')
      .select('*')
      .order('created_at', { ascending: false })

    if (clienteId) query = query.eq('cliente_id', clienteId)
    if (proyectoId) query = query.eq('proyecto_id', proyectoId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as Venta[]
  }
}
