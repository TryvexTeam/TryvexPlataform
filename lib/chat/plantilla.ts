/**
 * Plantillas de nombre en mensajes: `{nombre:<uuid>}` se pinta con el nombre
 * ACTUAL del integrante, así un saludo no queda con un nombre viejo si la
 * persona se lo cambia.
 */
const TOKEN = /\{nombre:([0-9a-f-]{36})\}/gi

export const tokenNombre = (integranteId: string) => `{nombre:${integranteId}}`

export function resolverPlantilla(texto: string, nombreDe: (id: string) => string | undefined): string {
  if (!texto.includes('{nombre:')) return texto
  return texto.replace(TOKEN, (_, id: string) => nombreDe(id)?.split(' ')[0] || 'compañero/a')
}
