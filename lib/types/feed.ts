import { z } from 'zod'

/**
 * El feed del equipo: lo que cada uno encuentra y quiere compartir (referencias,
 * videos, ideas) y las noticias que trae el radar. Ver migración 127.
 */

export const EMOJIS_FEED = ['🔥', '💡', '👏', '😂', '👀'] as const
export type EmojiFeed = (typeof EMOJIS_FEED)[number]

export type TipoPublicacion = 'post' | 'noticia'

const urlHttp = z
  .string()
  .trim()
  .max(2000)
  .url('El link no es válido')
  .refine((u) => /^https?:\/\//i.test(u), 'El link tiene que empezar con http:// o https://')

export const PublicacionInputSchema = z
  .object({
    texto: z.string().trim().max(4000).optional().transform((t) => (t ? t : undefined)),
    url: urlHttp.optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((p) => Boolean(p.texto || p.url), 'Escribe algo o pega un link')
export type PublicacionInput = z.infer<typeof PublicacionInputSchema>

export const ComentarioInputSchema = z.object({
  texto: z.string().trim().min(1, 'El comentario está vacío').max(2000),
})

export const ReaccionInputSchema = z.object({ emoji: z.enum(EMOJIS_FEED) })

export const ColeccionInputSchema = z.object({
  nombre: z.string().trim().min(1, 'Ponle nombre a la colección').max(80),
})

/** Lo que manda un agente (el radar) por cada noticia. */
export const NoticiaAgenteSchema = z.object({
  url: urlHttp,
  titulo: z.string().trim().min(1).max(300),
  resumen: z.string().trim().max(1000).optional(),
  fuente: z.string().trim().max(120).optional(),
})
export const LoteNoticiasSchema = z.object({ noticias: z.array(NoticiaAgenteSchema).min(1).max(30) })
export type NoticiaAgente = z.infer<typeof NoticiaAgenteSchema>

export interface VistaPrevia {
  titulo: string | null
  descripcion: string | null
  imagen: string | null
  sitio: string | null
}

export interface AutorPublicacion {
  id: string
  nombre: string
  avatarUrl: string | null
  color: string | null
  esAgente: boolean
}

export interface ComentarioFeed {
  id: string
  texto: string
  createdAt: string
  autor: AutorPublicacion | null
  esMio: boolean
}

export interface PublicacionFeed {
  id: string
  tipo: TipoPublicacion
  texto: string | null
  url: string | null
  vistaPrevia: VistaPrevia
  fuente: string | null
  createdAt: string
  autor: AutorPublicacion | null
  esMia: boolean
  /** Por emoji: cuántos y si yo reaccioné con ese. */
  reacciones: { emoji: EmojiFeed; total: number; mia: boolean }[]
  comentarios: ComentarioFeed[]
  /** Ids de las colecciones donde está guardada. */
  colecciones: string[]
}

export interface Coleccion {
  id: string
  nombre: string
  total: number
}
