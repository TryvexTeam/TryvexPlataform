/**
 * Cuándo un mensaje del cliente NO espera respuesta.
 *
 * Mismas reglas que el bot de WhatsApp (Vex-Agente/src/lib/cierre.ts): un
 * "gracias", un "👋" o una despedida cierran la conversación; no la dejan
 * pendiente. Sin esto, la pantalla marcaba como "18 días sin respuesta" a
 * Ópticas Kairos, cuyo último mensaje era una bendición de despedida, y a
 * Peluquería Época, cuyo último mensaje era un "👋" de otro bot.
 *
 * Si se cambia una regla acá, hay que cambiarla también en el bot: si no, la
 * pantalla y el agente no estarían de acuerdo en qué es un pendiente.
 */

// Portado de Vex-Agente: la global solo se usa para reemplazar; .test() no
// debe recordar la posición de una llamada anterior.
const EMOJIS = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu
const HAY_EMOJI = /\p{Extended_Pictographic}/u

export function esSoloEmoji(texto: string): boolean {
  const sinEmoji = texto.replace(EMOJIS, '').replace(/[\s!¡.,]/g, '')
  return sinEmoji.length === 0 && HAY_EMOJI.test(texto)
}

const CIERRE =
  /\b(gracias|muchas gracias|saludos|chao|chau|adi[oó]s|nos vemos|bendicion(es)?|bendiga|dios (te|le|los) bendiga|que (te|le) vaya bien|igualmente|excelente d[ií]a|buen d[ií]a|ok|oka|okey|dale|perfecto|listo|genial|de nada|un abrazo|cu[ií]date)\b/i

const RELLENO = new Set(
  'y que tengas tenga tengan un una muy muchas muchos a ti usted ustedes todo todos bien por tu su el la los las de del igual tambien también'.split(' '),
)

// Quitar únicamente fórmulas de cortesía evita confundir una objeción o
// una pregunta acompañada de «gracias» con un cierre puro.
export function esCierre(texto: string): boolean {
  const t = texto.trim()
  if (!t || t.includes('?')) return false
  if (esSoloEmoji(t)) return true
  if (t.length > 80 || !CIERRE.test(t)) return false

  const resto = t
    .toLowerCase()
    .replace(EMOJIS, ' ')
    .replace(new RegExp(CIERRE.source, 'gi'), ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p && !RELLENO.has(p))
  return resto.length === 0
}

const DESPEDIDA_PROPIA =
  /\b(que (te|le|les) vaya bien|cu[ií]date|saludos|[ée]xito|que est[eé]s? bien|hasta pronto|nos vemos|quedo atento|un abrazo)\b/i

export function esDespedidaPropia(texto: string): boolean {
  return DESPEDIDA_PROPIA.test(texto)
}

// Ambas pantallas revisan TODOS los entrantes pendientes: un emoji final no
// puede ocultar una pregunta anterior. Sin saliente, se revisa el hilo entero.
export function esperaRespuesta(
  ultimoSaliente: string | null,
  entrantes: readonly (string | null)[],
): boolean {
  if (entrantes.length === 0 || entrantes.every((texto) => esCierre(texto ?? ''))) return false
  return !(esDespedidaPropia(ultimoSaliente ?? '') && !entrantes.some((texto) => texto?.includes('?')))
}
