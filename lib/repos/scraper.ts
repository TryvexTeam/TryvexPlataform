import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/server'
import {
  ESTADOS_ACTIVOS,
  type FiltrosScraper,
  type ScraperRun,
  type ScraperRunConAutor,
} from '@/lib/types/scraper'

type SB = SupabaseClient<Database>

/** La corrida ya estaba tomada por otro. Se distingue para contestar 409 y no 500. */
export class YaHayUnaCorriendo extends Error {
  constructor() {
    super('Ya hay una corrida en curso')
    this.name = 'YaHayUnaCorriendo'
  }
}

/**
 * El buzon del scraper.
 *
 * Nadie de acá ejecuta nada: se deja escrito el pedido y el worker del VPS lo
 * levanta. Ver la migracion 040.
 */
export class ScraperRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** La corrida viva, si hay alguna. Es la que la pantalla muestra en curso. */
  async activa(): Promise<ScraperRunConAutor | null> {
    const { data, error } = await this.sb
      .from('scraper_runs')
      .select('*, dim_integrantes!scraper_runs_pedida_por_fkey(nombre)')
      .in('estado', ESTADOS_ACTIVOS)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? conAutor(data) : null
  }

  /** Las ultimas corridas terminadas, para el historial de la pantalla. */
  async historial(limite = 5): Promise<ScraperRunConAutor[]> {
    const { data, error } = await this.sb
      .from('scraper_runs')
      .select('*, dim_integrantes!scraper_runs_pedida_por_fkey(nombre)')
      .not('estado', 'in', `(${ESTADOS_ACTIVOS.join(',')})`)
      .order('fecha', { ascending: false })
      .limit(limite)

    if (error) throw new Error(error.message)
    return (data ?? []).map(conAutor)
  }

  /**
   * Encolar una corrida a nombre de quien la pide.
   *
   * El limite de "una a la vez" NO se comprueba acá con un SELECT previo: entre
   * ese SELECT y el INSERT caben dos personas apretando a la vez. Lo garantiza
   * el indice unico de la base (idx_scraper_runs_una_activa), y acá solo se
   * traduce ese choque a un error que la pantalla sabe contar.
   */
  async encolar(integranteId: string, filtros: FiltrosScraper): Promise<ScraperRun> {
    const { data, error } = await this.sb
      .from('scraper_runs')
      .insert({ estado: 'encolada', filtros, pedida_por: integranteId })
      .select()
      .single()

    // 23505 = unique_violation. Es el candado haciendo su trabajo, no una falla.
    if (error?.code === '23505') throw new YaHayUnaCorriendo()
    if (error) throw new Error(error.message)
    return data as ScraperRun
  }

  /**
   * Pedir que pare.
   *
   * Es un pedido, no una orden: el scraper corta entre categorias y no en medio
   * de una, para no dejar leads a medio escribir. Por eso la pantalla dice
   * "frenando..." y no "frenado".
   */
  async pedirFreno(id: string): Promise<boolean> {
    const { data, error } = await this.sb
      .from('scraper_runs')
      .update({ freno_pedido: true })
      .eq('id', id)
      .in('estado', ESTADOS_ACTIVOS)
      .select('id')

    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  }
}

/** Aplana el join del integrante a un solo campo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function conAutor(fila: any): ScraperRunConAutor {
  const { dim_integrantes, ...run } = fila
  return { ...run, pedida_por_nombre: dim_integrantes?.nombre ?? null }
}
