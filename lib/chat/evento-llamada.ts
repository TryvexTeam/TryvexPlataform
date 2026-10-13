import { pareceJson } from '@/lib/markdown/mini'

/**
 * Los eventos de llamada se guardan como JSON en `contenido`. Devuelve la etiqueta
 * de la píldora de sistema, o null si el mensaje es texto normal.
 */
export function describirEventoLlamada(contenido: string | null): string | null {
  if (!contenido || !pareceJson(contenido)) return null
  let dato: unknown
  try {
    dato = JSON.parse(contenido)
  } catch {
    return 'Evento de llamada'
  }
  if (!dato || typeof dato !== 'object') return 'Evento de llamada'
  const campos = dato as Record<string, unknown>
  const texto = [campos.texto, campos.mensaje, campos.descripcion].find((v) => typeof v === 'string')
  if (typeof texto === 'string' && texto.trim()) return texto.trim()
  const clave = String(campos.evento ?? campos.tipo ?? campos.estado ?? '').toLowerCase()
  if (/perdid|missed|rechaz/.test(clave)) return 'Llamada perdida'
  if (/fin|end|termin/.test(clave)) return 'Llamada finalizada'
  if (/inicio|start|iniciad/.test(clave)) return 'Llamada iniciada'
  return 'Evento de llamada'
}
