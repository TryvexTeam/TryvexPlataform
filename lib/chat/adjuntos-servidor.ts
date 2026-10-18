/** Cosas de adjuntos que comparten la ruta que firma y la que guarda el mensaje. */

export const BUCKET_ADJUNTOS = 'adjuntos-chat'

/** Nombre de archivo apto para una ruta de storage, sin perder la extensión. */
export function sanearNombreArchivo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80)
}

/**
 * Comprueba que la ruta cuelgue de la conversación que dice.
 *
 * Es la defensa contra que alguien mande una ruta apuntando a la carpeta de
 * otro hilo al registrar el adjunto: la ruta la arma el servidor al firmar,
 * pero vuelve por el navegador — y todo lo que vuelve del navegador se revisa.
 */
export function rutaPerteneceA(ruta: string, conversacionId: string): boolean {
  if (ruta.includes('..') || ruta.startsWith('/')) return false
  return ruta.startsWith(`${conversacionId}/`)
}
