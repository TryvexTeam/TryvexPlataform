import { describe, expect, it } from 'vitest'
import { calcularSlots, type CeldaOfrecida, type Ocupacion } from '@/lib/citas/slots'
import { diaSemanaLunes0, santiagoToUTC } from '@/lib/utils/fecha-santiago'

/** 2026-08-26 es MIÉRCOLES; en agosto Chile está en UTC-4. */
const MIERCOLES = '2026-08-26'

/** Un instante cómodo: 08:00 de Santiago, con toda la tarde por delante. */
const MANANA_DEL_MIERCOLES = new Date('2026-08-26T12:00:00Z')

function celda(diaSemana: number, hora: number, integranteId = 'ana'): CeldaOfrecida {
  return { integranteId, diaSemana, hora }
}

describe('diaSemanaLunes0', () => {
  it('mapea la semana con lunes en cero, como la tabla disponibilidad', () => {
    expect(diaSemanaLunes0('2026-08-24')).toBe(0) // lunes
    expect(diaSemanaLunes0('2026-08-26')).toBe(2) // miércoles
    expect(diaSemanaLunes0('2026-08-30')).toBe(6) // domingo
  })
})

describe('calcularSlots', () => {
  it('parte cada hora ofrecida en dos comienzos de 20 minutos', () => {
    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 1,
      celdas: [celda(2, 17)],
      ocupaciones: [],
      ahora: MANANA_DEL_MIERCOLES,
    })

    expect(slots).toEqual([
      { fecha: MIERCOLES, hora: '17:00' },
      { fecha: MIERCOLES, hora: '17:30' },
    ])
  })

  it('no ofrece nada cuando nadie publicó horas', () => {
    expect(
      calcularSlots({
        desde: MIERCOLES,
        dias: 14,
        celdas: [],
        ocupaciones: [],
        ahora: MANANA_DEL_MIERCOLES,
      })
    ).toEqual([])
  })

  it('solo ofrece la celda en el día de la semana que le toca', () => {
    // Celda de lunes: dentro de una ventana que arranca el miércoles, cae el 31.
    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 7,
      celdas: [celda(0, 17)],
      ocupaciones: [],
      ahora: MANANA_DEL_MIERCOLES,
    })

    expect(slots.map((s) => s.fecha)).toEqual(['2026-08-31', '2026-08-31'])
  })

  it('descarta las horas que caen dentro del margen de anticipación', () => {
    // Son las 16:30 de Santiago; el margen es de 2 h, así que 17:00 y 17:30
    // quedan fuera y 18:30 entra.
    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 1,
      celdas: [celda(2, 17), celda(2, 18)],
      ocupaciones: [],
      ahora: santiagoToUTC(MIERCOLES, '16:30'),
    })

    expect(slots.map((s) => s.hora)).toEqual(['18:30'])
  })

  it('un evento con asistentes bloquea solo a esas personas', () => {
    const ocupacion: Ocupacion = {
      inicio: santiagoToUTC(MIERCOLES, '17:00').getTime(),
      fin: santiagoToUTC(MIERCOLES, '17:20').getTime(),
      integrantes: ['ana'],
    }

    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 1,
      celdas: [celda(2, 17, 'ana'), celda(2, 17, 'beto')],
      ocupaciones: [ocupacion],
      ahora: MANANA_DEL_MIERCOLES,
    })

    // 17:00 sobrevive porque Beto está libre; 17:30 nunca estuvo tomada.
    expect(slots.map((s) => s.hora)).toEqual(['17:00', '17:30'])
  })

  it('un evento SIN asistentes bloquea a todos: es el calendario compartido', () => {
    const ocupacion: Ocupacion = {
      inicio: santiagoToUTC(MIERCOLES, '17:00').getTime(),
      fin: santiagoToUTC(MIERCOLES, '17:20').getTime(),
      integrantes: [],
    }

    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 1,
      celdas: [celda(2, 17, 'ana'), celda(2, 17, 'beto')],
      ocupaciones: [ocupacion],
      ahora: MANANA_DEL_MIERCOLES,
    })

    expect(slots.map((s) => s.hora)).toEqual(['17:30'])
  })

  it('un solape parcial también ocupa el slot', () => {
    // La reunión empieza a las 17:10: pisa el slot de 17:00-17:20 aunque no
    // coincida su comienzo.
    const ocupacion: Ocupacion = {
      inicio: santiagoToUTC(MIERCOLES, '17:10').getTime(),
      fin: santiagoToUTC(MIERCOLES, '17:40').getTime(),
      integrantes: [],
    }

    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 1,
      celdas: [celda(2, 17)],
      ocupaciones: [ocupacion],
      ahora: MANANA_DEL_MIERCOLES,
    })

    expect(slots).toEqual([])
  })

  it('no ofrece horas del pasado', () => {
    const slots = calcularSlots({
      desde: MIERCOLES,
      dias: 1,
      celdas: [celda(2, 10)],
      ocupaciones: [],
      ahora: santiagoToUTC(MIERCOLES, '20:00'),
    })

    expect(slots).toEqual([])
  })
})

/**
 * Chile cambia de huso dos veces al año. Un cálculo que asuma un desfase fijo
 * no falla al escribirlo: falla en septiembre, corriendo todas las horas
 * ofrecidas —y las citas ya agendadas— exactamente una hora.
 *
 * En 2026 el horario de verano empieza el domingo 6 de septiembre: ese día
 * Santiago pasa de UTC-4 a UTC-3.
 */
describe('calcularSlots en el cambio de horario', () => {
  it('mantiene la hora LOCAL a ambos lados del cambio', () => {
    const slots = calcularSlots({
      desde: '2026-09-04', // viernes, todavía UTC-4
      dias: 8, // hasta el 11, ya en UTC-3
      celdas: [celda(4, 17)], // viernes 17:00
      ocupaciones: [],
      ahora: new Date('2026-09-04T00:00:00Z'),
    })

    // Los dos viernes ofrecen las 17:00 locales, no una corrida.
    expect(slots.map((s) => `${s.fecha} ${s.hora}`)).toEqual([
      '2026-09-04 17:00',
      '2026-09-04 17:30',
      '2026-09-11 17:00',
      '2026-09-11 17:30',
    ])
  })

  it('esas dos horas locales caen en instantes UTC distintos', () => {
    // Antes del cambio, 17:00 de Santiago es 21:00 UTC (UTC-4).
    // Después, es 20:00 UTC (UTC-3). Si ambas dieran lo mismo, el cálculo
    // estaría asumiendo un desfase fijo.
    const antes = santiagoToUTC('2026-09-04', '17:00').getUTCHours()
    const despues = santiagoToUTC('2026-09-11', '17:00').getUTCHours()

    expect(antes).toBe(21)
    expect(despues).toBe(20)
  })
})
