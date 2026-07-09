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
        .select('*, eventos_asistentes ( integrante_id, dim_integrantes ( nombre ) )')
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

  async create(input: EventoInsert, creadoPorId: string): Promise<string> {
    // invitados_externos viaja a Google/email, no a la tabla eventos
    const { asistentes_ids, invitados_externos: _externos, ...evento } = input
    const { data, error } = await this.sb
      .from('eventos')
      .insert({ ...evento, creado_por: creadoPorId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const ids = asistentes_ids.length > 0 ? asistentes_ids : [creadoPorId]
    const { error: aError } = await this.sb.from('eventos_asistentes').insert(
      ids.map((integrante_id) => ({ evento_id: data.id, integrante_id }))
    )
    if (aError) throw new Error(aError.message)
    return data.id
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
