import { createClient } from '@/lib/supabase/server'
import type { AdjuntoMensaje, Conversacion, Mensaje, MiembroChat, TipoConversacion } from '@/lib/types/chat'

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

    type ConvRow = { id: string; tipo: TipoConversacion; nombre: string | null; ultimo_mensaje_at: string }
    return ((convs.data ?? []) as ConvRow[]).map((c) => ({
      id: c.id,
      tipo: c.tipo,
      nombre: c.nombre,
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
  async listMensajes(conversacionId: string, limite = 100): Promise<Mensaje[]> {
    const consulta = (columnas: string) =>
      this.sb
        .from('mensajes')
        .select(columnas)
        .eq('conversacion_id', conversacionId)
        .order('created_at', { ascending: false })
        .limit(limite)

    let { data, error } = await consulta('*, mensaje_adjuntos(id, nombre, tipo_mime, bytes, ancho, alto)')

    // PGRST200: no existe la relación. Es "falta la migración", no "falló la consulta".
    if (error?.code === 'PGRST200') {
      ;({ data, error } = await consulta('*'))
    }
    if (error) throw new Error(error.message)

    // Se piden los más nuevos, se muestran en orden cronológico.
    return ((data ?? []) as (Mensaje & { mensaje_adjuntos?: AdjuntoMensaje[] })[])
      .map(({ mensaje_adjuntos, ...m }) => ({ ...m, adjuntos: mensaje_adjuntos ?? [] }))
      .reverse()
  }

  async enviar(conversacionId: string, autorId: string, contenido: string | null): Promise<Mensaje> {
    const texto = contenido?.trim() || null
    const { data, error } = await this.sb
      .from('mensajes')
      .insert({ conversacion_id: conversacionId, autor_id: autorId, contenido: texto })
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
