/**
 * El historial corto de herramientas de un agente, para la ficha de la
 * oficina: las últimas 8, la más reciente primero.
 */

export const MAX_RECIENTES = 8

export interface Reciente {
  /** La etiqueta corta del hook ("Bash · npm", "Edit · db.ts"). */
  h: string
  at: string
}

/** Lo que venga de la base, limpio: solo entradas con la forma correcta. */
export function recientesValidos(valor: unknown): Reciente[] {
  if (!Array.isArray(valor)) return []
  return valor
    .filter((r): r is Reciente => typeof r?.h === 'string' && typeof r?.at === 'string')
    .slice(0, MAX_RECIENTES)
}

/**
 * Agrega una herramienta al principio. Si es la misma que la última (el agente
 * repite "Edit · db.ts" varias veces), se actualiza la hora en vez de llenar
 * el historial con la misma línea.
 */
export function agregarReciente(lista: unknown, h: string, at: string): Reciente[] {
  const previos = recientesValidos(lista)
  const resto = previos[0]?.h === h ? previos.slice(1) : previos
  return [{ h, at }, ...resto].slice(0, MAX_RECIENTES)
}

/** "hace 8 s", "hace 3 min", "hace 2 h": para lo que pasó recién. */
export function haceSegundos(iso: string, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000))
  if (s < 60) return `hace ${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  return `hace ${Math.floor(m / 60)} h`
}
