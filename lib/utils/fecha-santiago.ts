/**
 * Helpers de fecha para el Panel de Mando.
 *
 * Todo lo que se agrupa por día se agrupa en America/Santiago: `created_at` y
 * `entrada_at` son UTC y a las 20:00 de Santiago el UTC ya cambió de día
 * (riesgo documentado en T-001 §11). El dashboard no es el único lugar que
 * usa este patrón (`tabla-jornadas` y `cerebro.ts` hacen lo mismo), pero sí
 * el único que necesita construir ventanas de "últimos N días" desde cero.
 */

const DIA_SANTIAGO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' de un instante, según el calendario de Santiago. */
export function diaSantiago(instante: Date | string): string {
  const fecha = typeof instante === 'string' ? new Date(instante) : instante
  return DIA_SANTIAGO.format(fecha)
}

/**
 * Medianoche de Santiago de hace `diasAtras` días (0 = hoy), como Date UTC.
 *
 * El offset de Santiago (-3/-4) no se asume fijo: se parte de la medianoche
 * UTC del día objetivo y se avanza por horas hasta caer dentro de ese día
 * en Santiago. Son a lo más 5 pasos.
 */
export function inicioDiaSantiago(diasAtras: number): Date {
  const [anios, meses, dias] = diaSantiago(new Date()).split('-').map(Number)
  const objetivo = new Date(Date.UTC(anios, meses - 1, dias - diasAtras))
  const fechaObjetivo = objetivo.toISOString().slice(0, 10)
  let t = objetivo.getTime()
  while (diaSantiago(new Date(t)) !== fechaObjetivo) t += 3_600_000
  return new Date(t)
}

/** Los últimos `dias` días de Santiago en orden ascendente, terminando hoy. */
export function ultimosDiasSantiago(dias: number): string[] {
  const [anios, meses, diasHoy] = diaSantiago(new Date()).split('-').map(Number)
  const base = new Date(Date.UTC(anios, meses - 1, diasHoy))
  const salida: string[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = new Date(base)
    fecha.setUTCDate(fecha.getUTCDate() - i)
    salida.push(fecha.toISOString().slice(0, 10))
  }
  return salida
}
