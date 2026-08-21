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

/**
 * Poner o sacar un emoji de un mensaje. Es un interruptor: el mismo emoji dos veces
 * lo quita, así que no hay endpoint separado para deshacer.
 *
 * El tope de 16 caracteres no es capricho: un emoji con tono de piel y variantes
 * (👨‍👩‍👧‍👦) son varios code points unidos por ZWJ. Con 2 no entraban.
 */
export const ReaccionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
})

export type ReaccionInput = z.infer<typeof ReaccionSchema>

/** Los que ofrece la barra rápida. Se puede reaccionar con cualquiera igual. */
export const EMOJIS_RAPIDOS = ['👍', '🎉', '❤️', '😂', '👀', '🚀'] as const

/** Una reacción ya agrupada para mostrar: "👍 3", y si estoy entre esos 3. */
export type ReaccionAgrupada = {
  emoji: string
  cuenta: number
  /** Para pintarla activa y para que el clic sepa si suma o resta. */
  mia: boolean
  /** Nombres de quienes reaccionaron, para el tooltip. */
  quienes: string[]
}

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

/** `voz` es una sala persistente: se entra a hablar, no a leer. Ver migración 033. */
export type TipoConversacion = 'dm' | 'grupo' | 'agentes' | 'voz'

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

/**
 * Videos: el navegador los reproduce solo, sin librerías.
 *
 * Se apoya en el tipo MIME y en la extensión, como el resto: un `.mp4` subido
 * desde algunos teléfonos llega como `application/octet-stream`.
 */
export function esVideo(adjunto: AdjuntoMensaje): boolean {
  if (adjunto.tipo_mime.startsWith('video/')) return true
  return /\.(mp4|webm|ogv|mov|m4v)$/i.test(adjunto.nombre)
}

/**
 * Word, Excel y PowerPoint: **ningún navegador los dibuja.**
 *
 * Los visores de Google y Microsoft podrían, pero exigen que el archivo esté en
 * una URL pública, y este bucket es privado a propósito — son documentos
 * internos del equipo. Así que no se promete una vista previa que no existe: se
 * ofrece descargarlo, que es lo único honesto.
 */
export function esOfimatica(adjunto: AdjuntoMensaje): boolean {
  if (/^application\/vnd\.(openxmlformats-officedocument|ms-)/.test(adjunto.tipo_mime)) return true
  if (adjunto.tipo_mime === 'application/msword') return true
  return /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(adjunto.nombre)
}

/**
 * Páginas HTML: se dibujan, no se leen.
 *
 * Va ANTES que `esTexto` a propósito — un `.html` cumple las dos, y quien manda
 * una página quiere ver la página. El código queda a un clic, no al revés.
 */
export function esHtml(adjunto: AdjuntoMensaje): boolean {
  if (adjunto.tipo_mime === 'text/html') return true
  return /\.html?$/i.test(adjunto.nombre)
}

/**
 * PDFs: se miran dentro del chat, sin bajarlos.
 *
 * Es el caso más común de archivo que no es imagen ni texto — una cotización,
 * un informe — y hasta ahora había que descargarlo para saber si era el que uno
 * buscaba. Igual que con el texto, la extensión también cuenta: un PDF subido
 * desde Windows puede llegar como `application/octet-stream`.
 */
export function esPdf(adjunto: AdjuntoMensaje): boolean {
  if (adjunto.tipo_mime === 'application/pdf') return true
  return /\.pdf$/i.test(adjunto.nombre)
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
  /** Reacciones ya agrupadas por emoji. Vacío si nadie reaccionó. */
  reacciones?: ReaccionAgrupada[]
  /** Cuándo se fijó al tope de la conversación. Nulo = no fijado. */
  fijado_at?: string | null
  fijado_por?: string | null
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
