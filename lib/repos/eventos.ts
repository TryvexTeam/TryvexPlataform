import { createClient } from '@/lib/supabase/server'
import type { Evento, EventoInsert } from '@/lib/types/evento'

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
      asistentes: (e.eventos_asistentes ?? []).map((a) => ({
        integrante_id: a.integrante_id,
        nombre: a.dim_integrantes?.nombre ?? '',
      })),
      es_mio: e.creado_por !== null && e.creado_por === miId,
    }))
  }

  async create(input: EventoInsert, creadoPorId: string): Promise<string> {
    const { asistentes_ids, ...evento } = input
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
