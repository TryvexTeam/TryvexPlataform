import { createClient } from '@/lib/supabase/server'
import type { CrearNotaInput, EntradaCerebro, FiltroBitacora } from '@/lib/types/cerebro'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class CerebroRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Timeline filtrable. Sin filtros devuelve lo último de todo el negocio. */
  async listEntradas(filtro: FiltroBitacora): Promise<EntradaCerebro[]> {
    let query = this.sb
      .from('cerebro_timeline')
      .select('*')
      .order('ocurrio_at', { ascending: false })
      .limit(filtro.limite)

    if (filtro.entidad_tipo) query = query.eq('entidad_tipo', filtro.entidad_tipo)
    if (filtro.entidad_id) query = query.eq('entidad_id', filtro.entidad_id)
    if (filtro.fuente) query = query.eq('fuente', filtro.fuente)
    if (filtro.buscar) {
      // Busca en el texto visible; el índice GIN cubre la variante full-text.
      const patron = `%${filtro.buscar}%`
      query = query.or(`titulo.ilike.${patron},contenido.ilike.${patron},entidad_nombre.ilike.${patron}`)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as EntradaCerebro[]
  }

  /** Nota escrita a mano por alguien del equipo. */
  async crearNota(autorId: string, input: CrearNotaInput): Promise<EntradaCerebro> {
    const { data, error } = await this.sb
      .from('cerebro_entradas')
      .insert({
        entidad_tipo: input.entidad_tipo,
        entidad_id: input.entidad_id ?? null,
        fuente: 'nota',
        titulo: input.titulo.trim(),
        contenido: input.contenido?.trim() || null,
        autor_id: autorId,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    // Se relee desde la vista para devolverla ya con el nombre de la entidad y del autor.
    const { data: entrada, error: errLectura } = await this.sb
      .from('cerebro_timeline')
      .select('*')
      .eq('id', (data as { id: string }).id)
      .single()
    if (errLectura) throw new Error(errLectura.message)
    return entrada as EntradaCerebro
  }

  /** Cuántas entradas hay por fuente — para el resumen de la cabecera. */
  async contarPorFuente(): Promise<Record<string, number>> {
    const { data, error } = await this.sb.from('cerebro_entradas').select('fuente')
    if (error) throw new Error(error.message)

    const conteo: Record<string, number> = {}
    for (const fila of (data ?? []) as { fuente: string }[]) {
      conteo[fila.fuente] = (conteo[fila.fuente] ?? 0) + 1
    }
    return conteo
  }

  /** Entidades con más movimiento: los atajos de la barra lateral del cerebro. */
  async entidadesActivas(limite = 12): Promise<
    { entidad_tipo: string; entidad_id: string; entidad_nombre: string; total: number; ultima: string }[]
  > {
    const { data, error } = await this.sb
      .from('cerebro_timeline')
      .select('entidad_tipo, entidad_id, entidad_nombre, ocurrio_at')
      .not('entidad_id', 'is', null)
      .order('ocurrio_at', { ascending: false })
      .limit(600)
    if (error) throw new Error(error.message)

    const acumulado = new Map<
      string,
      { entidad_tipo: string; entidad_id: string; entidad_nombre: string; total: number; ultima: string }
    >()

    for (const fila of (data ?? []) as {
      entidad_tipo: string
      entidad_id: string
      entidad_nombre: string
      ocurrio_at: string
    }[]) {
      const clave = `${fila.entidad_tipo}:${fila.entidad_id}`
      const previo = acumulado.get(clave)
      if (previo) previo.total++
      else
        acumulado.set(clave, {
          entidad_tipo: fila.entidad_tipo,
          entidad_id: fila.entidad_id,
          entidad_nombre: fila.entidad_nombre,
          total: 1,
          // Las filas vienen ordenadas: la primera de cada entidad es la más reciente.
          ultima: fila.ocurrio_at,
        })
    }

    return [...acumulado.values()].sort((a, b) => b.ultima.localeCompare(a.ultima)).slice(0, limite)
  }
}
