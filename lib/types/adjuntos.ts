/**
 * Reglas de los adjuntos del chat, en un solo lugar.
 *
 * Por qué existe este archivo: los límites vivían solo dentro de la ruta del
 * servidor (`MAX_ARCHIVOS`, `MAX_MB` en `app/api/chat/mensajes/route.ts`), así
 * que la pantalla dejaba elegir un archivo de 20 MB sin decir nada y el usuario
 * se enteraba recién al fallar el envío. Un límite que solo conoce el servidor
 * no es una validación: es una trampa.
 *
 * Ahora la misma función la usan los dos lados.
 */

export const MAX_ARCHIVOS = 10

/** Tope por archivo. Se puede cumplir de verdad porque el navegador sube
 *  directo a Supabase Storage: si el archivo pasara por una función de Vercel,
 *  el techo real serían 4,5 MB (límite de infraestructura, no configurable). */
export const MAX_MB = 25
export const MAX_BYTES = MAX_MB * 1024 * 1024

/** Lo mínimo que hay que saber de un archivo para decidir si se acepta. Sirve
 *  igual para un `File` del navegador que para lo que llega por JSON. */
export type ArchivoCandidato = {
  nombre: string
  bytes: number
}

/**
 * Devuelve el motivo del rechazo, o `null` si los archivos se aceptan.
 *
 * Devuelve texto y no un booleano a propósito: el motivo es lo que se le
 * muestra a la persona, y si cada lado lo redacta por su cuenta terminan
 * diciendo cosas distintas para el mismo caso.
 */
export function validarArchivos(archivos: ArchivoCandidato[]): string | null {
  if (archivos.length > MAX_ARCHIVOS) {
    return `Máximo ${MAX_ARCHIVOS} archivos por mensaje`
  }
  for (const f of archivos) {
    if (f.bytes === 0) return `"${f.nombre}" está vacío`
    if (f.bytes > MAX_BYTES) {
      return `"${f.nombre}" pesa ${pesoLegible(f.bytes)} y el máximo es ${MAX_MB} MB`
    }
  }
  return null
}

/** Duplicada a propósito de `lib/types/chat.ts`: este módulo no importa nada,
 *  para poder usarlo desde el servidor sin arrastrar tipos del cliente. */
function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
