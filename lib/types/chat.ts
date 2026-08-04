import { z } from 'zod'

export const EnviarMensajeSchema = z.object({
  conversacion_id: z.string().uuid(),
  // Vacío se permite: un mensaje que es solo una foto es un mensaje válido. Que
  // no venga ni texto ni archivo lo rechaza el route, que sí ve los adjuntos.
  contenido: z.string().trim().max(4000, 'Máximo 4000 caracteres').optional(),
})

export const CrearConversacionSchema = z
  .object({
    tipo: z.enum(['dm', 'grupo']),
    nombre: z.string().trim().min(1).max(80).optional(),
    /** DM: el otro integrante. Grupo: todos los que se suman además de quien lo crea. */
    miembros: z.array(z.string().uuid()).min(1, 'Elige al menos una persona'),
  })
  .refine((v) => v.tipo === 'dm' || Boolean(v.nombre), {
    message: 'Los grupos necesitan nombre',
    path: ['nombre'],
  })
  .refine((v) => v.tipo === 'grupo' || v.miembros.length === 1, {
    message: 'Un mensaje directo es entre dos personas',
    path: ['miembros'],
  })

export type EnviarMensajeInput = z.infer<typeof EnviarMensajeSchema>
export type CrearConversacionInput = z.infer<typeof CrearConversacionSchema>

export type TipoConversacion = 'dm' | 'grupo' | 'agentes'

export type AdjuntoMensaje = {
  id: string
  nombre: string
  tipo_mime: string
  bytes: number
  ancho: number | null
  alto: number | null
}

/** ¿Se pinta como imagen o como tarjeta de archivo? */
export function esImagen(adjunto: AdjuntoMensaje): boolean {
  return adjunto.tipo_mime.startsWith('image/')
}

/** El adjunto se sirve por endpoint propio: revalida permiso en cada pedido y la
 *  URL no vence a mitad de la conversación, como pasaría con una firmada. */
export function urlAdjunto(id: string): string {
  return `/api/chat/adjuntos/${id}`
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type MiembroChat = {
  integrante_id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  ultimo_leido_at: string
}

export type Mensaje = {
  id: string
  conversacion_id: string
  /** Nulo cuando escribió un agente: entonces viene `agente_id`. */
  autor_id: string | null
  agente_id?: string | null
  /** Nulo cuando el mensaje es solo un adjunto. */
  contenido: string | null
  created_at: string
  editado_at: string | null
  eliminado_at: string | null
  adjuntos?: AdjuntoMensaje[]
}

export type Conversacion = {
  id: string
  tipo: TipoConversacion
  nombre: string | null
  ultimo_mensaje_at: string
  miembros: MiembroChat[]
  ultimo_mensaje: Mensaje | null
  no_leidos: number
}

/** Clave canónica de un DM: el par de UUIDs ordenado, para que exista un solo hilo. */
export function claveDm(a: string, b: string): string {
  return [a, b].sort().join(':')
}

/** En un DM el título es la otra persona; en un grupo, su nombre. */
export function tituloConversacion(conv: Conversacion, miIntegranteId: string): string {
  if (conv.tipo === 'grupo') return conv.nombre ?? 'Grupo'
  const otro = conv.miembros.find((m) => m.integrante_id !== miIntegranteId)
  return otro?.nombre ?? 'Mensaje directo'
}
