import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EMOJIS_FEED,
  type AutorPublicacion,
  type Coleccion,
  type ComentarioFeed,
  type EmojiFeed,
  type PublicacionFeed,
  type TipoPublicacion,
  type VistaPrevia,
} from '@/lib/types/feed'

/**
 * El feed del equipo (migración 128). Las tablas son nuevas y los tipos generados
 * todavía no las conocen: se usan sin tipar acá, en un solo lugar, igual que
 * `tabla-encargos.ts`. Para quitarlo: regenerar los tipos.
 */

const LIMITE = 40

type FilaPublicacion = {
  id: string
  tipo: TipoPublicacion
  texto: string | null
  url: string | null
  url_titulo: string | null
  url_descripcion: string | null
  url_imagen: string | null
  url_sitio: string | null
  fuente: string | null
  created_at: string
  autor_id: string | null
  agente_id: string | null
}
type Persona = { id: string; nombre: string; avatar_url: string | null; color: string | null }

export class FeedRepository {
  private sb: SupabaseClient

  constructor(supabase: SupabaseClient, private miIntegranteId: string) {
    this.sb = supabase as unknown as SupabaseClient
  }

  async listar(tipo: TipoPublicacion, coleccionId?: string): Promise<PublicacionFeed[]> {
    let ids: string[] | null = null
    if (coleccionId) {
      const { data, error } = await this.sb
        .from('coleccion_items')
        .select('publicacion_id')
        .eq('coleccion_id', coleccionId)
      if (error) throw new Error(error.message)
      ids = (data ?? []).map((f: { publicacion_id: string }) => f.publicacion_id)
      if (ids.length === 0) return []
    }

    let q = this.sb
      .from('publicaciones')
      .select('id, tipo, texto, url, url_titulo, url_descripcion, url_imagen, url_sitio, fuente, created_at, autor_id, agente_id')
      .is('eliminado_at', null)
      .order('created_at', { ascending: false })
      .limit(LIMITE)
    q = ids ? q.in('id', ids) : q.eq('tipo', tipo)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as FilaPublicacion[]
    if (filas.length === 0) return []
    const pubIds = filas.map((f) => f.id)

    const [reacciones, comentarios, items] = await Promise.all([
      this.sb.from('publicacion_reacciones').select('publicacion_id, integrante_id, emoji').in('publicacion_id', pubIds),
      this.sb
        .from('publicacion_comentarios')
        .select('id, publicacion_id, autor_id, texto, created_at')
        .in('publicacion_id', pubIds)
        .is('eliminado_at', null)
        .order('created_at'),
      this.sb.from('coleccion_items').select('publicacion_id, coleccion_id').in('publicacion_id', pubIds),
    ])
    for (const r of [reacciones, comentarios, items]) if (r.error) throw new Error(r.error.message)

    type R = { publicacion_id: string; integrante_id: string; emoji: EmojiFeed }
    type C = { id: string; publicacion_id: string; autor_id: string; texto: string; created_at: string }
    type I = { publicacion_id: string; coleccion_id: string }
    const filasR = (reacciones.data ?? []) as R[]
    const filasC = (comentarios.data ?? []) as C[]
    const filasI = (items.data ?? []) as I[]

    const personas = await this.personas([
      ...filas.map((f) => f.autor_id),
      ...filasC.map((c) => c.autor_id),
    ])
    const agentes = await this.agentes(filas.map((f) => f.agente_id))

    const autorDe = (autorId: string | null, agenteId: string | null): AutorPublicacion | null => {
      if (autorId && personas.has(autorId)) {
        const p = personas.get(autorId) as Persona
        return { id: p.id, nombre: p.nombre, avatarUrl: p.avatar_url, color: p.color, esAgente: false }
      }
      if (agenteId && agentes.has(agenteId)) {
        const a = agentes.get(agenteId) as Persona
        return { id: a.id, nombre: a.nombre, avatarUrl: a.avatar_url, color: a.color, esAgente: true }
      }
      return null
    }

    return filas.map((f) => {
      const vistaPrevia: VistaPrevia = {
        titulo: f.url_titulo,
        descripcion: f.url_descripcion,
        imagen: f.url_imagen,
        sitio: f.url_sitio,
      }
      const suyas = filasR.filter((r) => r.publicacion_id === f.id)
      const comentariosFeed: ComentarioFeed[] = filasC
        .filter((c) => c.publicacion_id === f.id)
        .map((c) => ({
          id: c.id,
          texto: c.texto,
          createdAt: c.created_at,
          autor: autorDe(c.autor_id, null),
          esMio: c.autor_id === this.miIntegranteId,
        }))
      return {
        id: f.id,
        tipo: f.tipo,
        texto: f.texto,
        url: f.url,
        vistaPrevia,
        fuente: f.fuente,
        createdAt: f.created_at,
        autor: autorDe(f.autor_id, f.agente_id),
        esMia: f.autor_id === this.miIntegranteId,
        reacciones: EMOJIS_FEED.map((emoji) => {
          const de = suyas.filter((r) => r.emoji === emoji)
          return { emoji, total: de.length, mia: de.some((r) => r.integrante_id === this.miIntegranteId) }
        }),
        comentarios: comentariosFeed,
        colecciones: filasI.filter((i) => i.publicacion_id === f.id).map((i) => i.coleccion_id),
      }
    })
  }

  async crear(texto: string | undefined, url: string | undefined, vista: VistaPrevia): Promise<string> {
    const { data, error } = await this.sb
      .from('publicaciones')
      .insert({
        tipo: 'post',
        autor_id: this.miIntegranteId,
        texto: texto ?? null,
        url: url ?? null,
        url_titulo: vista.titulo,
        url_descripcion: vista.descripcion,
        url_imagen: vista.imagen,
        url_sitio: vista.sitio,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  }

  /** Borrado suave: la RLS solo deja marcar las propias. */
  async borrar(id: string): Promise<boolean> {
    const { data, error } = await this.sb
      .from('publicaciones')
      .update({ eliminado_at: new Date().toISOString() })
      .eq('id', id)
      .eq('autor_id', this.miIntegranteId)
      .select('id')
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  }

  /** Pone o saca la reacción. Devuelve si quedó puesta. */
  async alternarReaccion(publicacionId: string, emoji: EmojiFeed): Promise<boolean> {
    const clave = { publicacion_id: publicacionId, integrante_id: this.miIntegranteId, emoji }
    const { data, error } = await this.sb.from('publicacion_reacciones').delete().match(clave).select('emoji')
    if (error) throw new Error(error.message)
    if ((data ?? []).length > 0) return false
    const { error: e2 } = await this.sb.from('publicacion_reacciones').insert(clave)
    if (e2) throw new Error(e2.message)
    return true
  }

  async comentar(publicacionId: string, texto: string): Promise<void> {
    const { error } = await this.sb
      .from('publicacion_comentarios')
      .insert({ publicacion_id: publicacionId, autor_id: this.miIntegranteId, texto })
    if (error) throw new Error(error.message)
  }

  async colecciones(): Promise<Coleccion[]> {
    const [cols, items] = await Promise.all([
      this.sb.from('colecciones').select('id, nombre').order('nombre'),
      this.sb.from('coleccion_items').select('coleccion_id'),
    ])
    if (cols.error) throw new Error(cols.error.message)
    if (items.error) throw new Error(items.error.message)
    const filasI = (items.data ?? []) as { coleccion_id: string }[]
    return ((cols.data ?? []) as { id: string; nombre: string }[]).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      total: filasI.filter((i) => i.coleccion_id === c.id).length,
    }))
  }

  async crearColeccion(nombre: string): Promise<string> {
    const { data, error } = await this.sb
      .from('colecciones')
      .insert({ nombre, creada_por: this.miIntegranteId })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe una colección con ese nombre')
      throw new Error(error.message)
    }
    return (data as { id: string }).id
  }

  /** Guarda o saca de la colección. Devuelve si quedó guardada. */
  async alternarEnColeccion(coleccionId: string, publicacionId: string): Promise<boolean> {
    const clave = { coleccion_id: coleccionId, publicacion_id: publicacionId }
    const { data: existe, error } = await this.sb.from('coleccion_items').select('agregado_por').match(clave).maybeSingle()
    if (error) throw new Error(error.message)
    if (existe) {
      const { data, error: e2 } = await this.sb.from('coleccion_items').delete().match(clave).select('coleccion_id')
      if (e2) throw new Error(e2.message)
      if ((data ?? []).length === 0) throw new Error('Solo quien la guardó puede sacarla de la colección')
      return false
    }
    const { error: e3 } = await this.sb.from('coleccion_items').insert({ ...clave, agregado_por: this.miIntegranteId })
    if (e3) throw new Error(e3.message)
    return true
  }

  private async personas(ids: (string | null)[]): Promise<Map<string, Persona>> {
    const unicos = [...new Set(ids.filter((i): i is string => Boolean(i)))]
    if (unicos.length === 0) return new Map()
    const { data, error } = await this.sb.from('dim_integrantes').select('id, nombre, avatar_url, color').in('id', unicos)
    if (error) throw new Error(error.message)
    return new Map(((data ?? []) as Persona[]).map((p) => [p.id, p]))
  }

  private async agentes(ids: (string | null)[]): Promise<Map<string, Persona>> {
    const unicos = [...new Set(ids.filter((i): i is string => Boolean(i)))]
    if (unicos.length === 0) return new Map()
    const { data } = await this.sb.from('agentes_publicos').select('id, nombre, avatar_url, color').in('id', unicos)
    return new Map(((data ?? []) as Persona[]).map((p) => [p.id, p]))
  }
}
