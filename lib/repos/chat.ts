import { createClient } from '@/lib/supabase/server'
import { claveDm, type Conversacion, type Mensaje, type MiembroChat, type TipoConversacion } from '@/lib/types/chat'

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

  async listMensajes(conversacionId: string, limite = 100): Promise<Mensaje[]> {
    const { data, error } = await this.sb
      .from('mensajes')
      .select('*')
      .eq('conversacion_id', conversacionId)
      .order('created_at', { ascending: false })
      .limit(limite)
    if (error) throw new Error(error.message)
    // Se piden los más nuevos, se muestran en orden cronológico.
    return ((data ?? []) as Mensaje[]).reverse()
  }

  async enviar(conversacionId: string, autorId: string, contenido: string): Promise<Mensaje> {
    const { data, error } = await this.sb
      .from('mensajes')
      .insert({ conversacion_id: conversacionId, autor_id: autorId, contenido: contenido.trim() })
      .select()
      .single()
    if (error) throw new Error(error.message)

    await this.marcarLeida(conversacionId, autorId)
    return data as Mensaje
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
  async abrirDm(miId: string, otroId: string): Promise<string> {
    if (miId === otroId) throw new Error('no_dm_conmigo_mismo')
    const key = claveDm(miId, otroId)

    const { data: existente } = await this.sb
      .from('conversaciones')
      .select('id')
      .eq('dm_key', key)
      .maybeSingle()
    if (existente) return (existente as { id: string }).id

    const { data, error } = await this.sb
      .from('conversaciones')
      .insert({ tipo: 'dm', dm_key: key, creada_por: miId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const conversacionId = (data as { id: string }).id
    await this.sumarMiembros(conversacionId, miId, [otroId])
    return conversacionId
  }

  async crearGrupo(miId: string, nombre: string, miembros: string[]): Promise<string> {
    const { data, error } = await this.sb
      .from('conversaciones')
      .insert({ tipo: 'grupo', nombre: nombre.trim(), creada_por: miId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const conversacionId = (data as { id: string }).id
    await this.sumarMiembros(conversacionId, miId, miembros)
    return conversacionId
  }

  /**
   * Dos inserts, no uno: la policy deja sumar a otros solo si ya se es miembro,
   * y dentro de un mismo statement la función de pertenencia todavía no ve la
   * fila propia recién insertada.
   */
  private async sumarMiembros(conversacionId: string, miId: string, otros: string[]): Promise<void> {
    const { error: errMio } = await this.sb
      .from('conversacion_miembros')
      .insert({ conversacion_id: conversacionId, integrante_id: miId })
    if (errMio) throw new Error(errMio.message)

    const restantes = [...new Set(otros)].filter((id) => id !== miId)
    if (restantes.length === 0) return

    const { error } = await this.sb
      .from('conversacion_miembros')
      .insert(restantes.map((integrante_id) => ({ conversacion_id: conversacionId, integrante_id })))
    if (error) throw new Error(error.message)
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
