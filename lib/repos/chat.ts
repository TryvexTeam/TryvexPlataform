import { createClient } from '@/lib/supabase/server'
import type {
  AdjuntoMensaje,
  Conversacion,
  Mensaje,
  MiembroChat,
  ReaccionAgrupada,
  TipoConversacion,
} from '@/lib/types/chat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface MiembroRow {
  conversacion_id: string
  integrante_id: string
  ultimo_leido_at: string
  dim_integrantes: { nombre: string; avatar_url: string | null; color: string | null } | null
}

export class ChatRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Bandeja: hilos del integrante, con miembros, último mensaje y no leídos. */
  async listConversaciones(integranteId: string): Promise<Conversacion[]> {
    const { data: mias, error: errMias } = await this.sb
      .from('conversacion_miembros')
      .select('conversacion_id, ultimo_leido_at')
      .eq('integrante_id', integranteId)
    if (errMias) throw new Error(errMias.message)

    const ids = (mias ?? []).map((m: { conversacion_id: string }) => m.conversacion_id)
    if (ids.length === 0) return []

    const leidoPorConv = new Map<string, string>(
      (mias ?? []).map((m: { conversacion_id: string; ultimo_leido_at: string }) => [
        m.conversacion_id,
        m.ultimo_leido_at,
      ]),
    )

    const [convs, miembros, ultimos] = await Promise.all([
      this.sb.from('conversaciones').select('*').in('id', ids).order('ultimo_mensaje_at', { ascending: false }),
      this.sb
        .from('conversacion_miembros')
        .select('conversacion_id, integrante_id, ultimo_leido_at, dim_integrantes(nombre, avatar_url, color)')
        .in('conversacion_id', ids),
      this.sb
        .from('mensajes')
        .select('*')
        .in('conversacion_id', ids)
        .order('created_at', { ascending: false }),
    ])

    if (convs.error) throw new Error(convs.error.message)

    const porConv = new Map<string, MiembroChat[]>()
    for (const m of (miembros.data ?? []) as MiembroRow[]) {
      const lista = porConv.get(m.conversacion_id) ?? []
      lista.push({
        integrante_id: m.integrante_id,
        nombre: m.dim_integrantes?.nombre ?? 'Sin nombre',
        avatar_url: m.dim_integrantes?.avatar_url ?? null,
        color: m.dim_integrantes?.color ?? null,
        ultimo_leido_at: m.ultimo_leido_at,
      })
      porConv.set(m.conversacion_id, lista)
    }

    // Los mensajes vienen ordenados del más nuevo al más viejo: el primero de
    // cada conversación es el último, y los posteriores a mi marca son no leídos.
    const ultimoPorConv = new Map<string, Mensaje>()
    const noLeidosPorConv = new Map<string, number>()
    for (const msj of ((ultimos.data ?? []) as Mensaje[])) {
      if (!ultimoPorConv.has(msj.conversacion_id)) ultimoPorConv.set(msj.conversacion_id, msj)

      const leido = leidoPorConv.get(msj.conversacion_id)
      if (msj.autor_id !== integranteId && leido && msj.created_at > leido) {
        noLeidosPorConv.set(msj.conversacion_id, (noLeidosPorConv.get(msj.conversacion_id) ?? 0) + 1)
      }
    }

    type ConvRow = {
      id: string
      tipo: TipoConversacion
      nombre: string | null
      avatar_url: string | null
      ultimo_mensaje_at: string
    }
    return ((convs.data ?? []) as ConvRow[]).map((c) => ({
      id: c.id,
      tipo: c.tipo,
      nombre: c.nombre,
      avatar_url: c.avatar_url,
      ultimo_mensaje_at: c.ultimo_mensaje_at,
      miembros: porConv.get(c.id) ?? [],
      ultimo_mensaje: ultimoPorConv.get(c.id) ?? null,
      no_leidos: noLeidosPorConv.get(c.id) ?? 0,
    }))
  }

  /**
   * Los adjuntos vienen en el mismo viaje: pedirlos aparte serían N consultas más
   * por hilo. La `ruta` no se expone al cliente — se sirve por endpoint propio.
   *
   * Si la tabla todavía no existe se reintenta sin ella. Suena defensivo de más,
   * pero es un caso verificado: Vercel despliega solo al mergear a `main` y las
   * migraciones se corren a mano, así que existe una ventana real en la que el
   * código nuevo convive con la base vieja. Sin este resguardo, en esa ventana el
   * chat entero deja de cargar con un PGRST200 — se rompe lo que ya funcionaba
   * por una función que todavía no está.
   */
  async listMensajes(
    conversacionId: string,
    limite = 100,
    miIntegranteId?: string,
  ): Promise<Mensaje[]> {
    const consulta = (columnas: string) =>
      this.sb
        .from('mensajes')
        .select(columnas)
        .eq('conversacion_id', conversacionId)
        // Lo que cuelga de un hilo vive dentro de ese hilo, no en el flujo.
        .is('hilo_padre', null)
        .order('created_at', { ascending: false })
        .limit(limite)

    let { data, error } = await consulta('*, mensaje_adjuntos(id, nombre, tipo_mime, bytes, ancho, alto)')

    // PGRST200: no existe la relación. Es "falta la migración", no "falló la consulta".
    if (error?.code === 'PGRST200') {
      ;({ data, error } = await consulta('*'))
    }
    if (error) throw new Error(error.message)

    // Se piden los más nuevos, se muestran en orden cronológico.
    const mensajes = ((data ?? []) as (Mensaje & { mensaje_adjuntos?: AdjuntoMensaje[] })[])
      .map(({ mensaje_adjuntos, ...m }) => ({ ...m, adjuntos: mensaje_adjuntos ?? [] }))
      .reverse()

    const conHilos = await this.conContadorDeHilo(mensajes)
    return miIntegranteId ? this.conReacciones(conHilos, miIntegranteId) : conHilos
  }

  /**
   * Las respuestas de un hilo, colgadas de un mensaje.
   */
  async listHilo(padreId: string, miIntegranteId?: string): Promise<Mensaje[]> {
    const { data, error } = await this.sb
      .from('mensajes')
      .select('*, mensaje_adjuntos(id, nombre, tipo_mime, bytes, ancho, alto)')
      .eq('hilo_padre', padreId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)

    const mensajes = ((data ?? []) as (Mensaje & { mensaje_adjuntos?: AdjuntoMensaje[] })[]).map(
      ({ mensaje_adjuntos, ...m }) => ({ ...m, adjuntos: mensaje_adjuntos ?? [] }),
    )

    // Dentro de un hilo también se reacciona: es donde más se responde "ok".
    return miIntegranteId ? this.conReacciones(mensajes, miIntegranteId) : mensajes
  }

  /**
   * Cuántas respuestas tiene cada mensaje. Va en una sola consulta y no una por
   * mensaje: con cien mensajes en pantalla, lo segundo son cien viajes.
   */
  private async conContadorDeHilo(mensajes: Mensaje[]): Promise<Mensaje[]> {
    const ids = mensajes.map((m) => m.id)
    if (ids.length === 0) return mensajes

    const { data, error } = await this.sb.from('mensajes').select('hilo_padre').in('hilo_padre', ids)
    // La columna todavía puede no existir (migración pendiente): sin contador,
    // pero sin romper el hilo entero.
    if (error) return mensajes

    const cuenta = new Map<string, number>()
    for (const f of (data ?? []) as { hilo_padre: string }[]) {
      cuenta.set(f.hilo_padre, (cuenta.get(f.hilo_padre) ?? 0) + 1)
    }
    return mensajes.map((m) => ({ ...m, respuestas: cuenta.get(m.id) ?? 0 }))
  }

  /**
   * Las reacciones de esos mensajes, ya agrupadas por emoji.
   *
   * Una sola consulta para toda la pantalla, igual que el contador de hilos: cien
   * mensajes no pueden ser cien viajes.
   *
   * Si la tabla todavía no existe (migración 032 pendiente), devuelve los mensajes
   * tal cual. Es la misma degradación que el resto del repo: en la ventana entre
   * deploy y migración, el chat sigue funcionando sin reacciones en vez de no cargar.
   */
  private async conReacciones(mensajes: Mensaje[], miIntegranteId: string): Promise<Mensaje[]> {
    const ids = mensajes.map((m) => m.id)
    if (ids.length === 0) return mensajes

    const { data, error } = await this.sb
      .from('mensaje_reacciones')
      .select('mensaje_id, emoji, integrante_id, dim_integrantes(nombre)')
      .in('mensaje_id', ids)

    if (error) return mensajes

    type Fila = {
      mensaje_id: string
      emoji: string
      integrante_id: string | null
      dim_integrantes: { nombre: string } | null
    }

    // mensaje -> emoji -> acumulado. El orden de inserción del Map conserva el orden
    // de aparición, así que el emoji que alguien puso primero queda primero.
    const porMensaje = new Map<string, Map<string, ReaccionAgrupada>>()

    for (const f of (data ?? []) as Fila[]) {
      const porEmoji = porMensaje.get(f.mensaje_id) ?? new Map<string, ReaccionAgrupada>()
      const actual = porEmoji.get(f.emoji) ?? { emoji: f.emoji, cuenta: 0, mia: false, quienes: [] }

      actual.cuenta += 1
      if (f.integrante_id === miIntegranteId) actual.mia = true
      actual.quienes.push(f.dim_integrantes?.nombre ?? 'Un agente')

      porEmoji.set(f.emoji, actual)
      porMensaje.set(f.mensaje_id, porEmoji)
    }

    return mensajes.map((m) => ({
      ...m,
      reacciones: [...(porMensaje.get(m.id)?.values() ?? [])],
    }))
  }

  /**
   * Pone o saca un emoji. Es un interruptor: reaccionar dos veces con el mismo
   * emoji lo quita, que es lo que espera cualquiera que use un chat.
   *
   * Devuelve el estado final para que la UI no tenga que adivinarlo.
   */
  async alternarReaccion(
    mensajeId: string,
    integranteId: string,
    emoji: string,
  ): Promise<{ puesta: boolean }> {
    const { data: existente, error: errorBusca } = await this.sb
      .from('mensaje_reacciones')
      .select('id')
      .eq('mensaje_id', mensajeId)
      .eq('integrante_id', integranteId)
      .eq('emoji', emoji)
      .maybeSingle()

    if (errorBusca) throw new Error(errorBusca.message)

    if (existente) {
      const { error } = await this.sb.from('mensaje_reacciones').delete().eq('id', existente.id)
      if (error) throw new Error(error.message)
      return { puesta: false }
    }

    const { error } = await this.sb
      .from('mensaje_reacciones')
      .insert({ mensaje_id: mensajeId, integrante_id: integranteId, emoji })

    if (error) {
      // 23505 = el índice único frenó un doble clic. El resultado deseado ya está.
      if (error.code === '23505') return { puesta: true }
      throw new Error(error.message)
    }
    return { puesta: true }
  }

  /**
   * Fija o suelta un mensaje. `fijado_por` lo completa el trigger de la 032.
   *
   * Fijar es un acto sobre la conversación, no sobre el mensaje propio: cualquier
   * miembro puede fijar el mensaje de otro, como en Slack. Quién puede hacerlo lo
   * decide el trigger, no este método.
   */
  async fijar(mensajeId: string, fijar: boolean): Promise<void> {
    const { error } = await this.sb
      .from('mensajes')
      .update({ fijado_at: fijar ? new Date().toISOString() : null })
      .eq('id', mensajeId)
    if (error) throw new Error(error.message)
  }

  /** Los fijados de una conversación, del más reciente al más viejo. */
  async listFijados(conversacionId: string): Promise<Mensaje[]> {
    const { data, error } = await this.sb
      .from('mensajes')
      .select('*')
      .eq('conversacion_id', conversacionId)
      .not('fijado_at', 'is', null)
      .order('fijado_at', { ascending: false })
      .limit(20)

    // 42703 = la columna no existe todavía. Sin fijados, pero sin romper el chat.
    if (error) return []
    return (data ?? []) as Mensaje[]
  }

  /**
   * Borra el mensaje de verdad: la fila desaparece de la base.
   *
   * Consecuencias que vienen de las claves foráneas de la 026, y son deliberadas:
   *   · `responder_a` es ON DELETE SET NULL → la respuesta que lo citaba sobrevive
   *     y muestra "Mensaje eliminado" en la cita.
   *   · `hilo_padre` es ON DELETE CASCADE → borrar el mensaje que abrió un hilo
   *     se lleva todas sus respuestas. Un hilo sin su origen no se entiende.
   */
  async eliminar(mensajeId: string): Promise<void> {
    const { error } = await this.sb.from('mensajes').delete().eq('id', mensajeId)
    if (error) throw new Error(error.message)
  }

  /**
   * Las rutas de storage de un mensaje y de todo lo que caiga con él.
   *
   * Se piden ANTES de borrar: una vez que la fila se va, el CASCADE se lleva las
   * de `mensaje_adjuntos` y ya no hay forma de saber qué archivos quedaron
   * colgados en el bucket. Nadie los ve, pero siguen ocupando espacio.
   */
  async rutasAdjuntosDe(mensajeId: string): Promise<string[]> {
    const { data: hijos } = await this.sb.from('mensajes').select('id').eq('hilo_padre', mensajeId)
    const ids = [mensajeId, ...((hijos ?? []) as { id: string }[]).map((h) => h.id)]

    const { data } = await this.sb.from('mensaje_adjuntos').select('ruta').in('mensaje_id', ids)
    return ((data ?? []) as { ruta: string }[]).map((a) => a.ruta)
  }

  async enviar(
    conversacionId: string,
    autorId: string,
    contenido: string | null,
    extra?: { responder_a?: string; hilo_padre?: string },
  ): Promise<Mensaje> {
    const texto = contenido?.trim() || null
    const { data, error } = await this.sb
      .from('mensajes')
      .insert({
        conversacion_id: conversacionId,
        autor_id: autorId,
        contenido: texto,
        responder_a: extra?.responder_a ?? null,
        hilo_padre: extra?.hilo_padre ?? null,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)

    await this.marcarLeida(conversacionId, autorId)
    return { ...(data as Mensaje), adjuntos: [] }
  }

  async marcarLeida(conversacionId: string, integranteId: string): Promise<void> {
    const { error } = await this.sb
      .from('conversacion_miembros')
      .update({ ultimo_leido_at: new Date().toISOString() })
      .eq('conversacion_id', conversacionId)
      .eq('integrante_id', integranteId)
    if (error) throw new Error(error.message)
  }

  /** Abre el DM con esa persona o devuelve el que ya existía. */
  /**
   * Crear el hilo y sumar los miembros va en una sola transacción del servidor
   * (`abrir_dm`, migración 022). Hacerlo en dos viajes devolvía 500: al pedir la
   * fila recién creada, PostgREST la somete a la policy de SELECT y el creador
   * todavía no es miembro.
   */
  async abrirDm(miId: string, otroId: string): Promise<string> {
    if (miId === otroId) throw new Error('no_dm_conmigo_mismo')

    const { data, error } = await this.sb.rpc('abrir_dm', { otro_id: otroId })
    if (error) throw new Error(error.message)
    return data as string
  }

  /** Mismo motivo que `abrirDm`: alta y miembros en una transacción (migración 022). */
  async crearGrupo(miId: string, nombre: string, miembros: string[]): Promise<string> {
    const { data, error } = await this.sb.rpc('crear_grupo', {
      p_nombre: nombre.trim(),
      p_miembros: miembros,
    })
    if (error) throw new Error(error.message)
    return data as string
  }

  async esMiembro(conversacionId: string, integranteId: string): Promise<boolean> {
    const { data } = await this.sb
      .from('conversacion_miembros')
      .select('integrante_id')
      .eq('conversacion_id', conversacionId)
      .eq('integrante_id', integranteId)
      .maybeSingle()
    return Boolean(data)
  }
}
