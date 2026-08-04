import { z } from 'zod'

export const EnviarMensajeSchema = z.object({
  conversacion_id: z.string().uuid(),
  // Vacío se permite: un mensaje que es solo una foto es un mensaje válido. Que
  // no venga ni texto ni archivo lo rechaza el route, que sí ve los adjuntos.
  // 4000 se quedaba corto: los agentes mandan informes largos y quedaban
  // rebotados sin poder partirlos. La columna es TEXT, el tope es de cordura.
  contenido: z.string().trim().max(20000, 'Máximo 20.000 caracteres').optional(),
  /** Cita a un mensaje puntual del hilo. */
  responder_a: z.string().uuid().optional(),
  /** Cuelga el mensaje de un hilo en vez del flujo principal. */
  hilo_padre: z.string().uuid().optional(),
})

export const LARGO_MAXIMO_MENSAJE = 20000

/** A partir de acá la burbuja se recorta y ofrece "Ver más". */
export const LARGO_PARA_RECORTAR = 1200

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

/**
 * Archivos que se pueden leer en el chat sin bajarlos.
 *
 * El tipo MIME no alcanza: un .md o un .log subido desde Windows llega como
 * `application/octet-stream` y quedaba como un archivo mudo que había que
 * descargar para saber qué decía. Por eso también se mira la extensión.
 */
const EXTENSIONES_TEXTO =
  /\.(txt|md|log|csv|json|ya?ml|sql|ts|tsx|js|jsx|py|sh|env|ini|conf|toml|xml|html?|css)$/i

export function esTexto(adjunto: AdjuntoMensaje): boolean {
  if (adjunto.tipo_mime.startsWith('text/')) return true
  if (/^application\/(json|xml|x-yaml|sql)/.test(adjunto.tipo_mime)) return true
  return EXTENSIONES_TEXTO.test(adjunto.nombre)
}

/** Un preview no puede traerse un log de 20MB al navegador. */
export const MAX_BYTES_PREVIEW = 256 * 1024

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
  /** Mensaje citado. */
  responder_a?: string | null
  /** Hilo del que cuelga. Nulo = va en el flujo principal. */
  hilo_padre?: string | null
  /** Cuántas respuestas tiene este mensaje en su hilo. */
  respuestas?: number
}

export type Conversacion = {
  id: string
  tipo: TipoConversacion
  /** Foto del hilo. Solo la tienen los que llevan nombre propio. */
  avatar_url?: string | null
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

/**
 * La foto del hilo. En un DM es la de la otra persona; en un grupo o canal, la
 * suya propia — antes se mostraba la de un miembro cualquiera, que no significa
 * nada cuando son seis.
 */
export function avatarConversacion(
  conv: Conversacion,
  miIntegranteId: string,
): { url: string | null; color: string | null } {
  if (conv.tipo !== 'dm') return { url: conv.avatar_url ?? null, color: null }
  const otro = conv.miembros.find((m) => m.integrante_id !== miIntegranteId)
  return { url: otro?.avatar_url ?? null, color: otro?.color ?? null }
}

/** En un DM el título es la otra persona; en un grupo, su nombre. */
export function tituloConversacion(conv: Conversacion, miIntegranteId: string): string {
  // Solo el DM se titula con la otra persona. El resto lleva su propio nombre —
  // preguntar por 'grupo' dejaba al canal de agentes cayendo en la rama del DM y
  // titulándose con el nombre de un integrante cualquiera.
  if (conv.tipo !== 'dm') return conv.nombre ?? (conv.tipo === 'agentes' ? 'Agentes' : 'Grupo')
  const otro = conv.miembros.find((m) => m.integrante_id !== miIntegranteId)
  return otro?.nombre ?? 'Mensaje directo'
}
