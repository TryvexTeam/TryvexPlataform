/**
 * Fechas y horas en la zona del negocio.
 *
 * La conversión Santiago → UTC estaba copiada en tres lugares
 * (lib/google/calendar-sync.ts, y dos veces en el repo de la landing). Chile
 * cambia de huso dos veces al año, así que una copia que se desactualice no
 * falla en el momento: falla en septiembre, corriendo todos los horarios una
 * hora, y con las citas ya agendadas.
 */

export const TZ_NEGOCIO = 'America/Santiago'

/**
 * Una hora local de Santiago (`"17:30"` del día `dateISO`) al instante UTC que
 * le corresponde. Correcto a través de los cambios de horario: Chile es UTC-3
 * en verano y UTC-4 en invierno, y el desfase se deduce de la zona en esa
 * fecha concreta en vez de asumirse.
 */
export function santiagoToUTC(dateISO: string, time: string): Date {
  const asUTC = new Date(`${dateISO}T${time}:00Z`)
  const santiagoLocal = asUTC.toLocaleString('sv-SE', { timeZone: TZ_NEGOCIO })
  const offset = asUTC.getTime() - new Date(santiagoLocal.replace(' ', 'T') + 'Z').getTime()
  return new Date(asUTC.getTime() + offset)
}

/**
 * Día de la semana en la convención de la tabla `disponibilidad`:
 * 0 = lunes … 6 = domingo (ver migración 004).
 *
 * `getUTCDay()` sobre la fecha del calendario y no `getDay()` sobre un Date
 * local: acá interesa qué día del calendario es `2026-09-07`, no en qué
 * instante cae según el reloj de quien ejecuta esto.
 */
export function diaSemanaLunes0(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** `2026-08-26` sumando `dias` días, sin salirse del calendario. */
export function sumarDias(dateISO: string, dias: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d + dias))
  return fecha.toISOString().slice(0, 10)
}

/** El día de hoy en Santiago, como `YYYY-MM-DD`. */
export function hoyEnSantiago(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ_NEGOCIO })
}
