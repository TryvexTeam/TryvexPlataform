/**
 * Disponibilidad de un integrante.
 *
 * Antes esto era un booleano: `activo` en `dim_integrantes`. Pero esa columna dice
 * si la persona pertenece al equipo, no si está trabajando ahora — alguien que se
 * fue hace seis horas seguía apareciendo disponible.
 *
 * Ahora sale de hechos que ya existen y que nadie tiene que acordarse de tocar:
 * el turno marcado en `jornadas` y las reuniones del calendario. La vista
 * `presencia_equipo` (migración 024) hace ese cruce.
 */

export const ESTADOS_PRESENCIA = [
  'disponible',
  'en_reunion',
  'en_pausa',
  'fuera_de_turno',
  'inactivo',
  /**
   * No sale de la vista `presencia_equipo` -- lo deriva `estadoVisible` en el
   * cliente cuando alguien tiene la pestaña abierta (Realtime Presence) pero
   * no marcó turno. Uno puede ponerse activo/inactivo sin tener jornada
   * abierta; nunca se guarda en la base.
   */
  'conectado_sin_turno',
] as const

export type EstadoPresencia = (typeof ESTADOS_PRESENCIA)[number]

export interface PresenciaIntegrante {
  integrante_id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  es_del_equipo: boolean
  en_turno: boolean
  turno_desde: string | null
  en_pausa: boolean
  reunion_desde: string | null
  estado: EstadoPresencia
}

export const PRESENCIA_LABEL: Record<EstadoPresencia, string> = {
  disponible: 'Disponible',
  en_reunion: 'En reunión',
  en_pausa: 'En pausa',
  fuera_de_turno: 'Fuera de turno',
  inactivo: 'Inactivo',
  conectado_sin_turno: 'Conectado (sin turno)',
}

/** Verde solo para disponible: si todo brilla, nada informa. */
export const PRESENCIA_COLOR: Record<EstadoPresencia, string> = {
  disponible: 'oklch(72% 0.17 145)',
  en_reunion: 'oklch(70% 0.16 25)',
  en_pausa: 'oklch(80% 0.15 85)',
  fuera_de_turno: 'oklch(60% 0.02 260)',
  inactivo: 'oklch(50% 0.01 260)',
  // Un azul apagado: ni el verde de "disponible" (no marcó turno) ni el gris
  // de "fuera de turno" (si estuviera realmente ausente no se vería esto).
  conectado_sin_turno: 'oklch(70% 0.1 240)',
}

/**
 * Estar en turno y tener el navegador abierto son cosas distintas: se puede haber
 * marcado la entrada y estar en otra máquina. Lo que se muestra combina ambas.
 *
 * `conectado` viene de Realtime Presence (pestaña abierta ahora). Marcó turno pero
 * no está conectado → sigue "disponible", porque el turno es la declaración
 * explícita y pesa más que la pestaña. Al revés, tener el navegador abierto sin
 * marcar entrada tampoco es "disponible" -- pero sí es información real: uno se
 * puede poner activo o inactivo sin tener jornada abierta, y antes esto se
 * perdía del todo (`fuera_de_turno` tapaba la conexión real).
 *
 * `inactivo` es distinto: sale de `i.activo = false` en la vista, un integrante
 * desactivado del equipo. Ahí `conectado` no cambia nada -- si está desactivado,
 * se muestra así aunque tenga la pestaña abierta.
 */
export function estadoVisible(
  presencia: PresenciaIntegrante | undefined,
  conectado: boolean,
): EstadoPresencia {
  if (!presencia) return conectado ? 'disponible' : 'inactivo'
  if (presencia.estado === 'fuera_de_turno' && conectado) return 'conectado_sin_turno'
  return presencia.estado
}

/**
 * Texto de apoyo bajo el nombre: "Disponible desde las 09:30".
 *
 * `conectado` es opcional para no romper a quien todavía no lo pasa: sin él
 * se comporta como antes (mira solo el estado crudo de la vista).
 */
export function detallePresencia(
  presencia: PresenciaIntegrante | undefined,
  conectado = false,
): string | null {
  if (!presencia) return null

  const hora = (iso: string) =>
    new Intl.DateTimeFormat('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Santiago',
    }).format(new Date(iso))

  if (presencia.estado === 'en_reunion' && presencia.reunion_desde) {
    return `En reunión desde las ${hora(presencia.reunion_desde)}`
  }
  if (presencia.estado === 'disponible' && presencia.turno_desde) {
    return `En turno desde las ${hora(presencia.turno_desde)}`
  }
  if (presencia.estado === 'en_pausa') return 'En pausa'
  if (presencia.estado === 'fuera_de_turno') {
    return conectado ? 'Conectado, sin turno abierto' : 'Sin turno abierto'
  }
  return null
}
