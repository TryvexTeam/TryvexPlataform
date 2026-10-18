import { createClient } from '@/lib/supabase/server'
import type { ConsumoLlamadas, Llamada, MotivoFin, ParticipanteLlamada } from '@/lib/types/llamada'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

export class LlamadasRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /**
   * La llamada viva de una conversación, si la hay.
   *
   * Antes de mirar, barre las zombis: una llamada que quedó 'sonando' porque el
   * navegador se cerró de golpe bloquearía todas las llamadas futuras del hilo
   * por el índice único. Se limpia acá y no en un cron porque este es justo el
   * momento en que estorba.
   */
  async viva(conversacionId: string): Promise<Llamada | null> {
    await this.sb.rpc('cerrar_llamadas_zombis', { conv_id: conversacionId })

    const { data, error } = await this.sb
      .from('llamadas')
      .select('*')
      .eq('conversacion_id', conversacionId)
      .neq('estado', 'terminada')
      .maybeSingle()

    if (error) throw new Error(error.message)
    return (data ?? null) as Llamada | null
  }

  /**
   * Cuánto se habló este mes y cuánto de eso pasó por relay.
   *
   * Solo el relay consume: lo directo no toca ningún servidor. Devuelve null si
   * no hay nada todavía, para que la tarjeta muestre ceros en vez de romperse.
   */
  async consumoDelMes(mes: string): Promise<ConsumoLlamadas | null> {
    const { data, error } = await this.sb
      .from('llamadas_resumen_mes')
      .select('*')
      .eq('mes', mes)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return (data ?? null) as ConsumoLlamadas | null
  }

  async porId(llamadaId: string): Promise<Llamada | null> {
    const { data, error } = await this.sb
      .from('llamadas')
      .select('*')
      .eq('id', llamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data ?? null) as Llamada | null
  }

  async participantes(llamadaId: string): Promise<ParticipanteLlamada[]> {
    const { data, error } = await this.sb
      .from('llamada_participantes')
      .select('*')
      .eq('llamada_id', llamadaId)
    if (error) throw new Error(error.message)
    return (data ?? []) as ParticipanteLlamada[]
  }

  /**
   * Abre la llamada e invita a todos los miembros del hilo.
   *
   * Si ya había una viva la devuelve en vez de crear otra: llamar a un hilo donde
   * ya se está hablando es unirse, no abrir una sala paralela. Eso además absorbe
   * el doble clic, que es como pasa en la práctica.
   */
  async iniciar(input: {
    conversacionId: string
    iniciadaPor: string
    conVideo: boolean
    miembros: string[]
  }): Promise<{ llamada: Llamada; yaExistia: boolean }> {
    const existente = await this.viva(input.conversacionId)
    if (existente) return { llamada: existente, yaExistia: true }

    const { data, error } = await this.sb
      .from('llamadas')
      .insert({
        conversacion_id: input.conversacionId,
        iniciada_por: input.iniciadaPor,
        con_video: input.conVideo,
        estado: 'sonando',
      })
      .select('*')
      .single()

    // 23505 = el índice único de "una llamada viva por conversación". Significa
    // que otro la creó entre el `viva()` de arriba y este insert: dos personas se
    // llamaron a la vez. La respuesta correcta es unirse a la que ganó, no fallar.
    if (error) {
      if (error.code === '23505') {
        const ganadora = await this.viva(input.conversacionId)
        if (ganadora) return { llamada: ganadora, yaExistia: true }
      }
      throw new Error(error.message)
    }

    const llamada = data as Llamada

    await this.sb.from('llamada_participantes').insert(
      input.miembros.map((integrante_id) => ({
        llamada_id: llamada.id,
        integrante_id,
        // Quien llama ya está dentro; al resto le suena el teléfono.
        estado: integrante_id === input.iniciadaPor ? 'en_llamada' : 'invitado',
        entro_at: integrante_id === input.iniciadaPor ? new Date().toISOString() : null,
      })),
    )

    return { llamada, yaExistia: false }
  }

  /** Alguien contestó. La primera vez que pasa, la llamada deja de sonar. */
  async entrar(llamadaId: string, integranteId: string): Promise<void> {
    const ahora = new Date().toISOString()

    await this.sb
      .from('llamada_participantes')
      .upsert(
        { llamada_id: llamadaId, integrante_id: integranteId, estado: 'en_llamada', entro_at: ahora, salio_at: null },
        { onConflict: 'llamada_id,integrante_id' },
      )

    // `contestada_at` solo se escribe si estaba vacío: marca cuándo empezó a
    // hablarse, y el segundo que entra no debe reiniciar ese reloj.
    const { error } = await this.sb
      .from('llamadas')
      .update({ estado: 'en_curso', contestada_at: ahora })
      .eq('id', llamadaId)
      .is('contestada_at', null)
    if (error) throw new Error(error.message)

    await this.sb.from('llamadas').update({ estado: 'en_curso' }).eq('id', llamadaId).eq('estado', 'sonando')
  }

  async rechazar(llamadaId: string, integranteId: string): Promise<void> {
    await this.sb
      .from('llamada_participantes')
      .upsert(
        { llamada_id: llamadaId, integrante_id: integranteId, estado: 'rechazo', salio_at: new Date().toISOString() },
        { onConflict: 'llamada_id,integrante_id' },
      )

    // En un uno a uno, rechazar es cortar: no queda nadie a quien esperar.
    const participantes = await this.participantes(llamadaId)
    const pendientes = participantes.filter((p) => p.estado === 'invitado' || p.estado === 'en_llamada')
    if (pendientes.length <= 1) {
      await this.terminar(llamadaId, 'rechazada')
    }
  }

  /**
   * Alguien se fue. Si queda una sola persona la llamada se cierra: nadie está
   * "en una llamada" consigo mismo, y dejarla viva bloquearía la próxima.
   */
  async salir(
    llamadaId: string,
    integranteId: string,
    medicion?: { viaRelay?: boolean; segundos?: number },
  ): Promise<void> {
    await this.sb
      .from('llamada_participantes')
      .update({
        estado: 'salio',
        salio_at: new Date().toISOString(),
        // `undefined` no se envía; la columna queda NULL y el resumen lo cuenta
        // como "sin medir" en vez de suponer que fue directa.
        via_relay: medicion?.viaRelay,
        segundos: medicion?.segundos,
      })
      .eq('llamada_id', llamadaId)
      .eq('integrante_id', integranteId)

    const participantes = await this.participantes(llamadaId)
    const dentro = participantes.filter((p) => p.estado === 'en_llamada')
    if (dentro.length <= 1) {
      const llamada = await this.porId(llamadaId)
      await this.terminar(llamadaId, llamada?.contestada_at ? 'colgada' : 'sin_respuesta')
    }
  }

  async terminar(llamadaId: string, motivo: MotivoFin): Promise<void> {
    const ahora = new Date().toISOString()

    // `neq estado terminada` la hace idempotente: dos personas cuelgan a la vez y
    // el motivo queda el de la primera, no el de la última en llegar.
    const { error } = await this.sb
      .from('llamadas')
      .update({ estado: 'terminada', terminada_at: ahora, motivo_fin: motivo })
      .eq('id', llamadaId)
      .neq('estado', 'terminada')
    if (error) throw new Error(error.message)

    await this.sb
      .from('llamada_participantes')
      .update({ estado: 'salio', salio_at: ahora })
      .eq('llamada_id', llamadaId)
      .eq('estado', 'en_llamada')
  }
}
