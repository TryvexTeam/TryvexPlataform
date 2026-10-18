import { createClient } from '@/lib/supabase/server'
import type {
  Jornada,
  JornadaAbiertaDeEquipo,
  JornadaResumen,
  JornadaUpdate,
  OrigenJornada,
  Pausa,
} from '@/lib/types/jornada'
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

  /**
   * Quiénes tienen la jornada ABIERTA en este momento, con su nombre y desde
   * cuándo.
   *
   * `getAbierta` responde por una persona; esto responde "quién está trabajando
   * ahora", que es lo que va en la portada. Se trae `pausas` porque el reloj
   * de la portada descuenta las pausas igual que el de la página de jornada:
   * dos relojes que cuentan distinto para la misma jornada es peor que no
   * tener el segundo.
   */
  async listAbiertas(): Promise<JornadaAbiertaDeEquipo[]> {
    const { data, error } = await this.sb
      .from('jornadas')
      .select('id, integrante_id, entrada_at, pausas, dim_integrantes ( nombre, avatar_url )')
      .is('salida_at', null)
      .order('entrada_at', { ascending: true })
    if (error) throw new Error(error.message)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((fila) => ({
      id: fila.id as string,
      integrante_id: fila.integrante_id as string,
      nombre: (fila.dim_integrantes?.nombre as string) ?? 'Sin nombre',
      avatar_url: (fila.dim_integrantes?.avatar_url as string | null) ?? null,
      entrada_at: fila.entrada_at as string,
      pausas: (fila.pausas ?? []) as Pausa[],
    }))
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
