import { diaSemanaLunes0, santiagoToUTC, sumarDias } from '@/lib/utils/fecha-santiago'
import {
  ANTICIPACION_MINIMA_HORAS,
  DURACION_CITA_MIN,
  MINUTOS_DE_SLOT,
  type SlotPublico,
} from '@/lib/types/disponibilidad'

/**
 * El cálculo de qué horas se pueden reservar, sin base de datos.
 *
 * Vive aparte del repositorio a propósito: acá está todo lo que puede salir
 * mal de verdad —el mapeo de día de semana, la expansión a slots, el cambio de
 * horario de Chile, el margen de anticipación— y nada de eso se puede probar
 * si está enredado con consultas. El repositorio trae los datos; esto decide.
 */

/** Una hora de la grilla semanal que alguien ofrece. */
export interface CeldaOfrecida {
  integranteId: string
  /** 0 = lunes … 6 = domingo (migración 004). */
  diaSemana: number
  hora: number
}

/** Un bloque de agenda que impide atender. */
export interface Ocupacion {
  inicio: number
  fin: number
  /**
   * Quiénes quedan bloqueados. Vacío significa TODOS: así llegan los eventos
   * del sync de Google, que caen sobre un calendario compartido del negocio —
   * si hay algo ahí, no se agenda encima.
   */
  integrantes: string[]
}

function estaOcupado(
  integranteId: string,
  inicio: number,
  fin: number,
  ocupaciones: Ocupacion[]
): boolean {
  return ocupaciones.some(
    (o) =>
      inicio < o.fin &&
      fin > o.inicio &&
      (o.integrantes.length === 0 || o.integrantes.includes(integranteId))
  )
}

/** Las celdas de una fecha concreta, agrupadas por hora del día. */
function celdasDeLaFecha(fecha: string, celdas: CeldaOfrecida[]): Map<number, string[]> {
  const diaSemana = diaSemanaLunes0(fecha)
  const porHora = new Map<number, string[]>()
  for (const celda of celdas) {
    if (celda.diaSemana !== diaSemana) continue
    const enEsaHora = porHora.get(celda.hora)
    if (enEsaHora) enEsaHora.push(celda.integranteId)
    else porHora.set(celda.hora, [celda.integranteId])
  }
  return porHora
}

/** Los comienzos posibles dentro de una hora: "17:00" y "17:30". */
function comienzosDeLaHora(hora: number): string[] {
  return MINUTOS_DE_SLOT.map(
    (minuto) => `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
  )
}

/**
 * Los huecos reservables entre `desde` y `desde + dias`, **anónimos**.
 *
 * Un slot aparece si al menos una persona lo tiene libre; nunca se dice quién
 * ni cuántos. Publicar los huecos ya publica lo ocupado por diferencia, y
 * agregar identidad convertiría esto en la agenda del equipo servida a
 * cualquiera que la muestree.
 *
 * @param ahora Instante de referencia. Es un parámetro y no `Date.now()` para
 *   que las pruebas puedan situarse en una fecha concreta — entre ellas, el
 *   día del cambio de horario.
 */
export function calcularSlots(params: {
  desde: string
  dias: number
  celdas: CeldaOfrecida[]
  ocupaciones: Ocupacion[]
  ahora: Date
}): SlotPublico[] {
  const { desde, dias, celdas, ocupaciones, ahora } = params
  if (celdas.length === 0) return []

  const minimo = ahora.getTime() + ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000
  const slots: SlotPublico[] = []

  for (let diaOffset = 0; diaOffset < dias; diaOffset++) {
    const fecha = sumarDias(desde, diaOffset)

    for (const [hora, integrantes] of celdasDeLaFecha(fecha, celdas)) {
      for (const comienzo of comienzosDeLaHora(hora)) {
        const inicio = santiagoToUTC(fecha, comienzo).getTime()
        const fin = inicio + DURACION_CITA_MIN * 60 * 1000

        // Ya pasó, o es demasiado sobre la hora para que alguien se prepare.
        if (inicio < minimo) continue

        const hayAlguienLibre = integrantes.some(
          (id) => !estaOcupado(id, inicio, fin, ocupaciones)
        )
        if (hayAlguienLibre) slots.push({ fecha, hora: comienzo })
      }
    }
  }

  // Por fecha y hora: el orden de la grilla no tiene por qué ser el de la
  // pantalla, y la landing los pinta en el orden en que llegan.
  return slots.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
}
