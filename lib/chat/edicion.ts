export const VENTANA_EDICION_MS = 15 * 60 * 1000

export function puedeEditarMensaje(
  createdAt: string,
  eliminadoAt: string | null,
  ahora = Date.now(),
): boolean {
  if (eliminadoAt) return false
  const edad = ahora - new Date(createdAt).getTime()
  return edad >= 0 && edad <= VENTANA_EDICION_MS
}
