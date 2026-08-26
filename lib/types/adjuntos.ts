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

/** Extensiones ejecutables/script: no aportan nada a un chat de equipo y son
 *  el vector clásico de malware por adjunto. Denylist, no allowlist — el chat
 *  recibe de todo (PDFs, planillas, imágenes, zips) y una allowlist cerrada
 *  rechazaría cosas legítimas que hoy funcionan. */
const EXTENSIONES_BLOQUEADAS = [
  'exe', 'bat', 'cmd', 'com', 'msi', 'msix', 'msp', 'scr', 'ps1', 'psm1',
  'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'sh', 'bash', 'app', 'jar',
  'dll', 'gadget', 'reg', 'lnk', 'apk', 'hta', 'cpl', 'pif', 'scf', 'url',
  'ws', 'wsc',
]

/** Windows recorta espacios y puntos finales del nombre al guardar el
 *  archivo en disco (comportamiento Win32 documentado), así que
 *  "malware.exe " o "malware.exe." terminan siendo "malware.exe"
 *  ejecutable aunque la extensión cruda no matchee el denylist. */
function extension(nombreCrudo: string): string {
  const nombre = nombreCrudo.trim().replace(/[. ]+$/, '')
  const punto = nombre.lastIndexOf('.')
  return punto === -1 ? '' : nombre.slice(punto + 1).toLowerCase()
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
    if (EXTENSIONES_BLOQUEADAS.includes(extension(f.nombre))) {
      return `"${f.nombre}" no se puede adjuntar (tipo de archivo no permitido)`
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
