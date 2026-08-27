import { createClient } from '@/lib/supabase/server'
import type { Proyecto, ProyectoInsert, ProyectoUpdate, Venta } from '@/lib/types/proyecto'
import { plantillaDe, type IdServicio } from '@/lib/types/servicios'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

/** Tope de ids por consulta: más arriba, la URL se vuelve impracticable. */
const LOTE_IDS = 200

/** Estados que significan "todavía se trabaja en esto". */
const ESTADOS_EN_CURSO = ['brief', 'desarrollo', 'revision', 'mantencion'] as const

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
      // Mismo criterio que leads.list(): techo de seguridad, no paginación
      // real — el kanban de proyectos también pinta la lista completa.
      .limit(5000)

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
  /**
   * Crea el proyecto y, por cada servicio vendido, sus tareas base.
   *
   * Un proyecto puede llevar varios servicios porque una venta real rara vez
   * es uno solo: landing más automatización, o MVP más WhatsApp. Las tareas de
   * todos entran al mismo backlog, cada una etiquetada con su servicio en la
   * descripción para que se sepa de qué bloque viene.
   */
  async crearConPlantilla(
    datos: ProyectoInsert,
    serviciosIds: string[],
    createdBy: string | null,
  ): Promise<string> {
    const proyectoId = await this.create(datos)

    const plantillas = serviciosIds
      .map((id) => plantillaDe(id as IdServicio))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))

    if (plantillas.length === 0) return proyectoId

    // Un solo insert con las tareas de todos los servicios: una ida a la base
    // por servicio multiplicaría la espera sin ganar nada.
    const filas = plantillas.flatMap((plantilla) =>
      plantilla.tareas.map((tarea) => ({
        titulo: tarea.titulo,
        // Con varios servicios en el mismo tablero, el nombre del servicio
        // delante es lo que permite saber a qué bloque pertenece cada tarea.
        descripcion:
          plantillas.length > 1
            ? `${plantilla.nombre} — ${tarea.descripcion}`
            : tarea.descripcion,
        tipo: tarea.tipo,
        prioridad: tarea.prioridad,
        esfuerzo: tarea.esfuerzo,
        proyecto_id: proyectoId,
        created_by: createdBy,
        estado: 'backlog',
      })),
    )

    // Si este insert falla, el proyecto ya quedó creado. No se revierte a
    // propósito: es mejor un proyecto sin tareas (el usuario las agrega a mano)
    // que borrar un registro que quizá ya tiene datos asociados.
    const { error } = await this.sb.from('tareas').insert(filas)
    if (error) throw new Error(error.message)

    return proyectoId
  }

  /**
   * Quiénes trabajan en cada proyecto, en una sola consulta.
   *
   * Va por lotes y no por embed anidado a propósito: pedir los ids sueltos en
   * la URL fue lo que tumbó la página de leads (541 ids = 20.137 caracteres y
   * la petición muere), y los embeds anidados de PostgREST se rompen en cuanto
   * aparece una segunda clave foránea hacia la misma tabla.
   */
  async equiposDe(proyectoIds: string[]): Promise<Map<string, string[]>> {
    const porProyecto = new Map<string, string[]>()
    if (proyectoIds.length === 0) return porProyecto

    for (let i = 0; i < proyectoIds.length; i += LOTE_IDS) {
      const lote = proyectoIds.slice(i, i + LOTE_IDS)
      const { data, error } = await this.sb
        .from('proyecto_integrantes')
        .select('proyecto_id, integrante_id')
        .in('proyecto_id', lote)
      if (error) throw new Error(error.message)

      for (const fila of (data ?? []) as { proyecto_id: string; integrante_id: string }[]) {
        const actuales = porProyecto.get(fila.proyecto_id) ?? []
        actuales.push(fila.integrante_id)
        porProyecto.set(fila.proyecto_id, actuales)
      }
    }

    return porProyecto
  }

  /** El equipo de un proyecto concreto. */
  async equipoDe(proyectoId: string): Promise<string[]> {
    return (await this.equiposDe([proyectoId])).get(proyectoId) ?? []
  }

  /**
   * Deja el equipo del proyecto exactamente como dice `integranteIds`.
   *
   * Borra y reinserta en vez de calcular el diferencial: son unas pocas filas
   * por proyecto y el diferencial solo añadiría ocasiones de equivocarse.
   */
  /**
   * Reemplaza el equipo del proyecto en un solo paso atómico.
   *
   * Antes era delete() + insert() como dos llamadas de PostgREST: si el insert
   * fallaba, el proyecto quedaba sin equipo y sin rollback. `set_proyecto_equipo`
   * (migración 063) hace ambas dentro de la misma transacción SQL.
   */
  async fijarEquipo(proyectoId: string, integranteIds: string[]): Promise<void> {
    const { error } = await this.sb.rpc('set_proyecto_equipo', {
      p_proyecto_id: proyectoId,
      p_integrante_ids: integranteIds,
    })
    if (error) throw new Error(error.message)
  }

  /**
   * Cuántos proyectos EN CURSO tiene encima cada integrante.
   *
   * Entregado y cerrado no cuentan: la cifra mide carga de trabajo actual, y un
   * proyecto terminado hace meses seguiría inflándola para siempre.
   */
  async proyectosActivosPorIntegrante(): Promise<Map<string, number>> {
    const { data, error } = await this.sb
      .from('proyecto_integrantes')
      .select('integrante_id, dim_proyectos!inner ( estado )')
      .in('dim_proyectos.estado', ESTADOS_EN_CURSO)
    if (error) throw new Error(error.message)

    const conteo = new Map<string, number>()
    for (const fila of (data ?? []) as { integrante_id: string }[]) {
      conteo.set(fila.integrante_id, (conteo.get(fila.integrante_id) ?? 0) + 1)
    }
    return conteo
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

  /**
   * Deshace una creación a medio camino: borra las tareas que `crearConPlantilla`
   * ya haya insertado y el proyecto en sí.
   *
   * `tareas.proyecto_id` tiene `ON DELETE SET NULL` (no cascade) porque una tarea
   * puede sobrevivir a su proyecto en el uso normal. Acá el caso es distinto: el
   * proyecto nunca terminó de crearse, así que dejar las tareas huérfanas con
   * `proyecto_id = NULL` sería peor que borrarlas — quedarían flotando sin
   * contexto y sin forma fácil de encontrarlas.
   */
  async eliminarCreacionParcial(id: string): Promise<void> {
    const { error: tareasError } = await this.sb.from('tareas').delete().eq('proyecto_id', id)
    if (tareasError) throw new Error(tareasError.message)
    await this.delete(id)
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
