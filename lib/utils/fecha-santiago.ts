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
 * Parsea un 'YYYY-MM-DD' (fecha_limite de una tarea, sin hora) como
 * medianoche LOCAL, no UTC.
 *
 * `new Date('YYYY-MM-DD')` lo interpreta como medianoche UTC — regla propia
 * de ECMAScript para strings de solo fecha, distinta de `new Date(y, m, d)`.
 * En Chile (UTC-3/-4) esa medianoche UTC cae la tarde/noche anterior en hora
 * local, así que formatear o comparar el resultado directo corre la fecha un
 * día para atrás. Bug real: una tarea con fecha_limite '2026-08-25' se
 * mostraba "24 ago" en la tarjeta.
 */
export function parseFechaLocal(fecha: string): Date {
  const [anios, meses, dias] = fecha.split('-').map(Number)
  return new Date(anios, meses - 1, dias)
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

/**
 * Una hora local de Santiago ("17:30" del día `fecha`) al instante UTC que le
 * corresponde.
 *
 * Correcto a través de los cambios de horario: Chile es UTC-3 en verano y
 * UTC-4 en invierno, y el desfase se deduce de la zona en esa fecha concreta
 * en vez de asumirse. Estaba copiada en `lib/google/calendar-sync.ts` y dos
 * veces en el repo de la landing; una copia que se desactualice no falla al
 * escribirla, falla en septiembre con las citas ya agendadas.
 */
export function santiagoToUTC(fecha: string, hora: string): Date {
  const comoUTC = new Date(`${fecha}T${hora}:00Z`)
  const localSantiago = comoUTC.toLocaleString('sv-SE', { timeZone: 'America/Santiago' })
  const desfase = comoUTC.getTime() - new Date(localSantiago.replace(' ', 'T') + 'Z').getTime()
  return new Date(comoUTC.getTime() + desfase)
}

/**
 * Día de la semana en la convención de la tabla `disponibilidad`:
 * 0 = lunes … 6 = domingo (migración 004).
 *
 * `getUTCDay()` sobre la fecha del calendario y no `getDay()` sobre un Date
 * local: acá interesa qué día del calendario es '2026-09-07', no en qué
 * instante cae según el reloj de quien ejecuta esto.
 */
export function diaSemanaLunes0(fecha: string): number {
  const [anios, meses, dias] = fecha.split('-').map(Number)
  return (new Date(Date.UTC(anios, meses - 1, dias)).getUTCDay() + 6) % 7
}

/** 'YYYY-MM-DD' sumando `dias` días, sin salirse del calendario. */
export function sumarDias(fecha: string, dias: number): string {
  const [anios, meses, diasBase] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anios, meses - 1, diasBase + dias)).toISOString().slice(0, 10)
}

/**
 * Fecha y hora de un instante UTC, escritas en la hora de Santiago.
 *
 * Existe porque `format(new Date(x))` de date-fns usa la zona de QUIEN lo
 * ejecuta, y en este proyecto eso son dos zonas distintas: el servidor de
 * Vercel corre en UTC y el navegador de Cristian en America/Santiago. El mismo
 * instante salía con 3 o 4 horas de diferencia según quién lo dibujara — y a
 * veces con OTRO día.
 *
 * No es solo una hora mal puesta: cuando el HTML del servidor dice una hora y
 * el cliente dibuja otra, React descarta la hidratación de ese árbol y lo
 * vuelve a renderizar entero en el navegador. Ese es el mecanismo detrás de la
 * copia huérfana que aparecía en el DOM de la ficha de tarea.
 */
const FECHA_HORA_SANTIAGO = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function fechaHoraSantiago(instante: Date | string): string {
  const fecha = typeof instante === 'string' ? new Date(instante) : instante
  if (Number.isNaN(fecha.getTime())) return ''

  // Se arma por partes y no con el string entero porque el formato de es-CL
  // mete comas y un "de" en posiciones que cambian entre versiones de Node.
  const p = Object.fromEntries(
    FECHA_HORA_SANTIAGO.formatToParts(fecha).map((x) => [x.type, x.value]),
  )
  return `${p.day} de ${p.month}, ${p.hour}:${p.minute}`
}

