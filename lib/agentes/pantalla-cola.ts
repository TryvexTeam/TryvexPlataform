/**
 * Qué muestra la pantalla grande de la oficina: la Cola, en cuatro columnas.
 *
 * Lo rechazado no aparece (dejó de ser trabajo), y de lo respondido solo lo
 * de hoy: la pantalla cuenta qué está pasando ahora, no el archivo.
 */

export interface EncargoPantalla {
  id: string
  agenteId: string
  titulo: string
  estado: 'encolado' | 'aprobado' | 'en_curso' | 'respondido' | 'rechazado'
  prioridad: 'baja' | 'media' | 'alta'
  creadoAt: string
  respondidoAt: string | null
}

export const COLUMNAS_PANTALLA = [
  { id: 'encolado', titulo: 'Esperando permiso', color: '#f3b54a' },
  { id: 'aprobado', titulo: 'Aprobados', color: '#6c9cf5' },
  { id: 'en_curso', titulo: 'En curso', color: '#3fcf8e' },
  { id: 'respondido', titulo: 'Listos hoy', color: '#a7b0c0' },
] as const

export type ColumnaPantalla = (typeof COLUMNAS_PANTALLA)[number]['id']

const PESO = { alta: 0, media: 1, baja: 2 } as const

function esDeHoy(iso: string | null, ahora: number): boolean {
  if (!iso) return false
  const a = new Date(ahora)
  const f = new Date(iso)
  return a.getFullYear() === f.getFullYear() && a.getMonth() === f.getMonth() && a.getDate() === f.getDate()
}

/** Los encargos de cada columna: lo urgente arriba, y a igual urgencia lo más nuevo. */
export function columnasDePantalla(encargos: EncargoPantalla[], ahora: number): Record<ColumnaPantalla, EncargoPantalla[]> {
  const cols: Record<ColumnaPantalla, EncargoPantalla[]> = { encolado: [], aprobado: [], en_curso: [], respondido: [] }
  for (const e of encargos) {
    if (e.estado === 'rechazado') continue
    if (e.estado === 'respondido' && !esDeHoy(e.respondidoAt, ahora)) continue
    cols[e.estado].push(e)
  }
  for (const c of Object.values(cols)) {
    c.sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || Date.parse(b.creadoAt) - Date.parse(a.creadoAt))
  }
  return cols
}

/** "recién", "hace 5 min", "hace 2 h", "hace 3 d". */
export function haceCuanto(iso: string, ahora: number): string {
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

/**
 * Qué encargos cambiaron entre dos momentos: los nuevos y los que cambiaron de
 * estado. Son los que hacen que su agente se levante a mirar la pantalla.
 */
export function encargosQueCambiaron(
  antes: Map<string, EncargoPantalla['estado']>,
  ahora: EncargoPantalla[],
): EncargoPantalla[] {
  return ahora.filter((e) => antes.get(e.id) !== e.estado)
}
