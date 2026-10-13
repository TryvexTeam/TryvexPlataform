/**
 * Un mensaje no tiene límite de caracteres. El único tope real es el cuerpo de la
 * petición: la función de Vercel corta a los 4,5 MB. Se avisa antes de enviar.
 */
export const CUERPO_MAXIMO_BYTES = 4_500_000
/** Lo que ocupa el resto del JSON (ids, adjuntos, llaves). */
const RESERVA_JSON_BYTES = 20_000

export function bytesDeTexto(texto: string): number {
  return new TextEncoder().encode(texto).length
}

export function cuerpoDemasiadoGrande(contenido: string): boolean {
  return bytesDeTexto(contenido) > CUERPO_MAXIMO_BYTES - RESERVA_JSON_BYTES
}

export const MENSAJE_CUERPO_GRANDE =
  'El mensaje es demasiado largo para enviarlo (el tope técnico es de unos 4,5 MB). Divídelo en partes o adjúntalo como archivo.'

/** ¿Se recorta la burbuja con "Leer más"? */
export function debeRecortarse(contenido: string | null, umbral: number): boolean {
  return (contenido?.length ?? 0) > umbral
}
