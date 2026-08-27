import { createClient } from '@/lib/supabase/server'
import type { Jornada, JornadaResumen, JornadaUpdate, OrigenJornada, Pausa } from '@/lib/types/jornada'
import { enPausa } from '@/lib/types/jornada'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

export class JornadasRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** La jornada abierta (sin salida) del integrante, si la hay. */
  async getAbierta(integranteId: string): Promise<Jornada | null> {
    const { data, error } = await this.sb
      .from('jornadas')
      .select('*')
      .eq('integrante_id', integranteId)
      .is('salida_at', null)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as Jornada) ?? null
  }

  async listPropias(integranteId: string, desde: string, hasta: string): Promise<JornadaResumen[]> {
    const { data, error } = await this.sb
      .from('jornadas_resumen')
      .select('*')
      .eq('integrante_id', integranteId)
      .gte('entrada_at', desde)
      .lte('entrada_at', hasta)
      .order('entrada_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as JornadaResumen[]
  }

  /** Todo el equipo — la RLS ya bloquea a quien no sea admin. */
  async listEquipo(desde: string, hasta: string): Promise<JornadaResumen[]> {
    const { data, error } = await this.sb
      .from('jornadas_resumen')
      .select('*')
      .gte('entrada_at', desde)
      .lte('entrada_at', hasta)
      .order('entrada_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as JornadaResumen[]
  }

  async marcarEntrada(integranteId: string, origen: OrigenJornada, nota?: string | null): Promise<Jornada> {
    const abierta = await this.getAbierta(integranteId)
    if (abierta) throw new Error('jornada_ya_abierta')

    const { data, error } = await this.sb
      .from('jornadas')
      .insert({ integrante_id: integranteId, origen, nota: nota ?? null })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as Jornada
  }

  async marcarSalida(integranteId: string, nota?: string | null): Promise<Jornada> {
    const abierta = await this.getAbierta(integranteId)
    if (!abierta) throw new Error('sin_jornada_abierta')

    const ahora = new Date().toISOString()
    // Si se va con la pausa abierta, se cierra en el mismo instante que la salida.
    const pausas = enPausa(abierta)
      ? abierta.pausas.map((p, i) => (i === abierta.pausas.length - 1 ? { ...p, fin: ahora } : p))
      : abierta.pausas

    const { data, error } = await this.sb
      .from('jornadas')
      .update({ salida_at: ahora, pausas, nota: nota ?? abierta.nota })
      .eq('id', abierta.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as Jornada
  }

  async pausar(integranteId: string): Promise<Jornada> {
    const abierta = await this.getAbierta(integranteId)
    if (!abierta) throw new Error('sin_jornada_abierta')
    if (enPausa(abierta)) throw new Error('ya_en_pausa')

    const pausas: Pausa[] = [...abierta.pausas, { inicio: new Date().toISOString() }]
    return this.actualizarPausas(abierta.id, pausas)
  }

  async reanudar(integranteId: string): Promise<Jornada> {
    const abierta = await this.getAbierta(integranteId)
    if (!abierta) throw new Error('sin_jornada_abierta')
    if (!enPausa(abierta)) throw new Error('no_esta_en_pausa')

    const ahora = new Date().toISOString()
    const pausas = abierta.pausas.map((p, i) =>
      i === abierta.pausas.length - 1 ? { ...p, fin: ahora } : p,
    )
    return this.actualizarPausas(abierta.id, pausas)
  }

  private async actualizarPausas(jornadaId: string, pausas: Pausa[]): Promise<Jornada> {
    const { data, error } = await this.sb
      .from('jornadas')
      .update({ pausas })
      .eq('id', jornadaId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as Jornada
  }

  /** Corrección manual (la RLS permite las propias; el admin, cualquiera). */
  async actualizar(jornadaId: string, data: JornadaUpdate): Promise<Jornada> {
    const { data: row, error } = await this.sb
      .from('jornadas')
      .update(data)
      .eq('id', jornadaId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return row as Jornada
  }
}
