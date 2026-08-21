import { createClient } from '@/lib/supabase/server'
import type { AsistenteExterno, Evento, EventoInsert, EventoDesdeGoogle } from '@/lib/types/evento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface EventoRow {
  id: string
  titulo: string
  tipo: Evento['tipo']
  inicio: string
  fin: string
  lead_id: string | null
  cliente_id: string | null
  creado_por: string | null
  notas: string | null
  created_at: string
  google_event_id: string | null
  origen: Evento['origen']
  meet_link: string | null
  ubicacion: string | null
  html_link: string | null
  asistentes_externos: AsistenteExterno[] | null
  eventos_asistentes: { integrante_id: string; dim_integrantes: { nombre: string } | null }[] | null
}

export class EventosRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Eventos en un rango, con asistentes. es_mio = creado por el integrante del usuario actual */
  async listRango(desde: string, hasta: string, authUserId: string): Promise<Evento[]> {
    const [{ data, error }, miId] = await Promise.all([
      this.sb
        .from('eventos')
        // El embed va desambiguado por el NOMBRE de la foreign key. Desde la
        // migración 051, `eventos_asistentes` tiene DOS FKs a `dim_integrantes`
        // (`integrante_id` y `asignado_por`), y sin nombrar cuál, PostgREST no
        // puede resolver la relación y responde 500. Aquí interesa el asistente,
        // no quién lo asignó.
        .select(
          '*, eventos_asistentes ( integrante_id, dim_integrantes!eventos_asistentes_integrante_id_fkey ( nombre ) )'
        )
        .gte('inicio', desde)
        .lt('inicio', hasta)
        .order('inicio'),
      this.integranteIdDe(authUserId),
    ])
    if (error) throw new Error(error.message)

    return ((data ?? []) as EventoRow[]).map((e) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      inicio: e.inicio,
      fin: e.fin,
      lead_id: e.lead_id,
      cliente_id: e.cliente_id,
      creado_por: e.creado_por,
      notas: e.notas,
      created_at: e.created_at,
      google_event_id: e.google_event_id,
      origen: e.origen,
      meet_link: e.meet_link,
      ubicacion: e.ubicacion,
      html_link: e.html_link,
      asistentes_externos: e.asistentes_externos ?? [],
      asistentes: (e.eventos_asistentes ?? []).map((a) => ({
        integrante_id: a.integrante_id,
        nombre: a.dim_integrantes?.nombre ?? '',
      })),
      es_mio: e.creado_por !== null && e.creado_por === miId,
    }))
  }

  /**
   * Reuniones del rango contadas por integrante asistente, para el marcador
   * del equipo. Devuelve solo a quien participo en alguna: quien no aparece
   * no queda expuesto con un cero publico.
   *
   * El embed va SIN desambiguar, al reves que en `listRango`: alli el `!fkey`
   * hace falta porque se baja hasta `dim_integrantes`, y `eventos_asistentes`
   * tiene dos FKs hacia esa tabla (`integrante_id` y `asignado_por`). De
   * `eventos` a `eventos_asistentes` solo hay una FK, asi que nombrar una aqui
   * apuntaria a una relacion que no existe entre ese par de tablas.
   */
  async contarPorIntegrante(desdeISO: string, hastaISO: string): Promise<Map<string, number>> {
    const { data, error } = await this.sb
      .from('eventos')
      .select('id, eventos_asistentes ( integrante_id )')
      .gte('inicio', desdeISO)
      .lt('inicio', hastaISO)

    if (error) throw new Error(error.message)

    const porIntegrante = new Map<string, number>()
    for (const evento of (data ?? []) as { eventos_asistentes: { integrante_id: string }[] | null }[]) {
      // Un evento cuenta UNA vez por persona aunque figure repetida en la
      // tabla puente: el marcador mide reuniones, no filas.
      const vistos = new Set<string>()
      for (const asistente of evento.eventos_asistentes ?? []) {
        if (!asistente.integrante_id || vistos.has(asistente.integrante_id)) continue
        vistos.add(asistente.integrante_id)
        porIntegrante.set(
          asistente.integrante_id,
          (porIntegrante.get(asistente.integrante_id) ?? 0) + 1,
        )
      }
    }
    return porIntegrante
  }

  /**
   * Crea el evento y sus asistentes en un solo paso atómico.
   *
   * Antes eran dos llamadas separadas de PostgREST (insert en `eventos` +
   * insert en `eventos_asistentes`): si la segunda fallaba, el evento quedaba
   * creado sin nadie asignado y sin forma de deshacerlo. `crear_evento_con_asistentes`
   * (migración 068) hace ambas dentro de la misma transacción SQL.
   */
  async create(input: EventoInsert, creadoPorId: string): Promise<string> {
    // invitados_externos viaja a Google/email, no a la tabla eventos
    const { asistentes_ids, invitados_externos: _externos, ...evento } = input
    const { data, error } = await this.sb.rpc('crear_evento_con_asistentes', {
      p_titulo: evento.titulo,
      p_tipo: evento.tipo,
      p_inicio: evento.inicio,
      p_fin: evento.fin,
      p_lead_id: evento.lead_id ?? null,
      p_cliente_id: evento.cliente_id ?? null,
      p_notas: evento.notas ?? null,
      p_creado_por: creadoPorId,
      p_asistentes_ids: asistentes_ids,
    })
    if (error) throw new Error(error.message)
    return data as string
  }

  /** Upsert idempotente desde Google Calendar. Si el evento nació en el CRM
   *  (origen = 'crm'), actualiza solo los datos del evento sin pisar origen/creado_por. */
  async upsertFromGoogle(evento: EventoDesdeGoogle): Promise<void> {
    const { data: existente } = await this.sb
      .from('eventos')
      .select('id, origen')
      .eq('google_event_id', evento.google_event_id)
      .maybeSingle()

    if (existente) {
      const { error } = await this.sb
        .from('eventos')
        .update(evento)
        .eq('id', existente.id)
      if (error) throw new Error(error.message)
      return
    }

    const { error } = await this.sb
      .from('eventos')
      .insert({ ...evento, origen: 'google', creado_por: null })
    if (error) throw new Error(error.message)
  }

  /** Vincula un evento del CRM con su copia creada en Google Calendar */
  async setGoogleData(
    id: string,
    data: { google_event_id: string; meet_link: string | null; html_link: string | null }
  ): Promise<void> {
    const { error } = await this.sb.from('eventos').update(data).eq('id', id)
    if (error) throw new Error(error.message)
  }

  /** google_event_id + origen de un evento (para borrar también en Google) */
  async getGoogleRef(id: string): Promise<{ google_event_id: string | null; origen: Evento['origen'] } | null> {
    const { data } = await this.sb
      .from('eventos')
      .select('google_event_id, origen')
      .eq('id', id)
      .maybeSingle()
    return data ?? null
  }

  /** Emails de integrantes activos por id (para invitaciones de calendario) */
  async emailsDeIntegrantes(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select('email')
      .in('id', ids)
      .eq('activo', true)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { email: string | null }[])
      .map((r) => r.email)
      .filter((e): e is string => Boolean(e))
  }

  async deleteByGoogleId(googleEventId: string): Promise<void> {
    const { error } = await this.sb
      .from('eventos')
      .delete()
      .eq('google_event_id', googleEventId)
    if (error) throw new Error(error.message)
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.sb.from('eventos').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async integranteIdDe(authUserId: string): Promise<string | null> {
    const { data } = await this.sb
      .from('dim_integrantes')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('activo', true)
      .single()
    return data?.id ?? null
  }
}
