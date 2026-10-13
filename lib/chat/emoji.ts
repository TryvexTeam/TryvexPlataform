const EMOJI = /\p{Extended_Pictographic}/u
const RESTO_PERMITIDO = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F\u20E3\u{1F1E6}-\u{1F1FF}]+$/u

export function cantidadEmoji(texto: string): number {
  const limpio = texto.trim().replace(/\s/gu, '')
  if (!limpio || !EMOJI.test(limpio) || !RESTO_PERMITIDO.test(limpio)) return 0
  const segmentador = new Intl.Segmenter('es', { granularity: 'grapheme' })
  return [...segmentador.segment(limpio)].length
}

export function esSoloEmoji(texto: string | null): boolean {
  const cantidad = texto ? cantidadEmoji(texto) : 0
  return cantidad >= 1 && cantidad <= 3
}
