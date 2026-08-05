import { createClient } from '@/lib/supabase/server'
import { normalizarConsulta, salaVacia, type CambioSala, type Pista, type SalaMusica } from '@/lib/types/musica'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class MusicaRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /**
   * La sala de un hilo. Si nunca se puso musica ahi, devuelve una sala vacia en
   * vez de null: el reproductor y los comandos no tienen por que distinguir entre
   * "nunca hubo musica" y "ahora no suena nada", y hacerlos distinguir obligaria
   * a repetir el mismo `?? salaVacia()` en cada llamador.
   */
  async sala(conversacionId: string): Promise<SalaMusica> {
    const { data, error } = await this.sb
      .from('sala_musica')
      .select('*')
      .eq('conversacion_id', conversacionId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return salaVacia(conversacionId)

    const fila = data as SalaMusica
    // `cola` e `historial` son JSONB: si alguien los deja en null a mano, el
    // reductor recibiria undefined y explotaria al hacer spread.
    return { ...fila, cola: fila.cola ?? [], historial: fila.historial ?? [] }
  }

  /**
   * Escribe el resultado de un comando.
   *
   * Es un upsert porque la primera cancion de un hilo crea la fila y todas las
   * demas la actualizan, y separar los dos caminos solo abriria la ventana para
   * que dos personas creen la sala a la vez. La PK sobre `conversacion_id` hace
   * que el segundo insert se convierta en update en vez de fallar con 23505.
   */
  async guardar(conversacionId: string, cambio: CambioSala): Promise<SalaMusica> {
    const actual = await this.sala(conversacionId)

    const { data, error } = await this.sb
      .from('sala_musica')
      .upsert(
        {
          ...actual,
          ...cambio,
          conversacion_id: conversacionId,
          actualizado_at: new Date().toISOString(),
        },
        { onConflict: 'conversacion_id' },
      )
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    const fila = data as SalaMusica
    return { ...fila, cola: fila.cola ?? [], historial: fila.historial ?? [] }
  }

  /**
   * Una busqueda ya pagada, si la hay.
   *
   * `search.list` cuesta 100 de las 10.000 unidades diarias y la cuota no se
   * puede ampliar. Este metodo es lo que separa "100 busquedas por dia para todo
   * el equipo" de "100 busquedas DISTINTAS por dia", que en la practica es la
   * diferencia entre que la funcion sirva o no.
   */
  async busquedaCacheada(consulta: string): Promise<Pista[] | null> {
    const { data, error } = await this.sb
      .from('musica_busquedas')
      .select('resultados')
      .eq('consulta', normalizarConsulta(consulta))
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? ((data as { resultados: Pista[] }).resultados ?? null) : null
  }

  /**
   * Guarda lo que costo 100 unidades.
   *
   * Un fallo aca no debe romper la busqueda: el usuario ya tiene sus resultados y
   * negarselos porque el cache no se pudo escribir seria cobrarle dos veces el
   * mismo error. Se traga la excepcion a proposito y la unica consecuencia es que
   * la proxima vez se vuelva a pagar.
   */
  async guardarBusqueda(consulta: string, resultados: Pista[]): Promise<void> {
    await this.sb
      .from('musica_busquedas')
      .upsert(
        { consulta: normalizarConsulta(consulta), resultados, created_at: new Date().toISOString() },
        { onConflict: 'consulta' },
      )
      .then(
        () => undefined,
        () => undefined,
      )
  }
}
