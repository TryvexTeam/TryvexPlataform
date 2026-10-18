import type { Pausa } from '@/lib/types/jornada'

/**
 * Jornadas que quedaron abiertas y hay que cerrar solas.
 *
 * Irse sin marcar salida no deja un hueco: deja una jornada que sigue contando
 * toda la noche. Al día siguiente aparece alguien con 30 horas y el marcador
 * del equipo deja de significar nada — que es justo el dato con el que Cristian
 * quiere gobernar el trabajo.
 *
 * El corte es por duración y no por "última actividad" a propósito: la
 * actividad se registra solo mientras el CRM está abierto, y alguien puede
 * pasar dos horas en una reunión sin tocar la pantalla. Lo que sí sabemos con
 * certeza es cuánto lleva abierta.
 */

/** Nadie trabaja 12 horas seguidas sin marcar una pausa. Más que eso es olvido. */
export const HORAS_MAXIMAS = 12

export interface JornadaAbierta {
  id: string
  integrante_id: string
  entrada_at: string
  pausas?: Pausa[] | null
}

export interface CierreSugerido {
  id: string
  integrante_id: string
  /** Cuándo se le pone la salida: la entrada + el máximo, no "ahora". */
  salida_at: string
  horas: number
}

/**
 * Cuáles cerrar, y con qué hora de salida.
 *
 * La salida NO es "ahora": es la entrada más el máximo. Si alguien entró a las
 * 9 y se olvidó, poner la salida a las 3 de la madrugada del día siguiente
 * (cuando corre el cron) sería inventar horas que no trabajó. Con el tope, al
 * menos el número es defendible y la persona puede corregirlo a mano.
 */
export function jornadasParaCerrar(
  abiertas: JornadaAbierta[],
  ahora = new Date(),
  horasMaximas = HORAS_MAXIMAS,
): CierreSugerido[] {
  const limiteMs = horasMaximas * 3_600_000
  const salida: CierreSugerido[] = []

  for (const j of abiertas) {
    const entrada = new Date(j.entrada_at).getTime()
    if (Number.isNaN(entrada)) continue
    const abiertaHace = ahora.getTime() - entrada
    if (abiertaHace <= limiteMs) continue
    salida.push({
      id: j.id,
      integrante_id: j.integrante_id,
      salida_at: new Date(entrada + limiteMs).toISOString(),
      horas: horasMaximas,
    })
  }

  return salida
}
