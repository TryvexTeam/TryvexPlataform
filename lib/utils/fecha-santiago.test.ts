import { describe, it, expect } from 'vitest'
import { abreDiaNuevo, etiquetaDiaChat, fechaHoraSantiago, parseFechaLocal } from './fecha-santiago'

describe('parseFechaLocal', () => {
  it('conserva el día, mes y año exactos del string', () => {
    // Arrange
    const entrada = '2026-08-25'

    // Act
    const resultado = parseFechaLocal(entrada)

    // Assert
    expect(resultado.getFullYear()).toBe(2026)
    expect(resultado.getMonth()).toBe(7) // agosto = índice 7
    expect(resultado.getDate()).toBe(25)
  })

  it('devuelve medianoche LOCAL, no UTC — así el día no se corre en zonas detrás de UTC', () => {
    // Bug real reportado: una tarea con fecha_limite '2026-08-25' se
    // mostraba "24 ago" en Chile (UTC-3/-4), porque new Date('2026-08-25')
    // se interpreta como medianoche UTC, no medianoche local.
    const resultado = parseFechaLocal('2026-08-25')

    // Medianoche local: las tres son 0 en la zona horaria de quien corre el
    // test, sin importar cuál sea — a diferencia de new Date('2026-08-25'),
    // cuyas getHours()/getMinutes() locales varían según el offset de la
    // zona horaria del entorno.
    expect(resultado.getHours()).toBe(0)
    expect(resultado.getMinutes()).toBe(0)
    expect(resultado.getSeconds()).toBe(0)
  })

  it('respeta años bisiestos', () => {
    const resultado = parseFechaLocal('2028-02-29')

    expect(resultado.getMonth()).toBe(1)
    expect(resultado.getDate()).toBe(29)
  })
})

describe('etiquetaDiaChat', () => {
  // 2026-09-05 15:00 de Santiago.
  const ahora = new Date('2026-09-05T18:00:00Z')

  it('dice "Hoy" para un mensaje del mismo día de Santiago', () => {
    expect(etiquetaDiaChat('2026-09-05T04:30:00Z', ahora)).toBe('Hoy')
  })

  it('dice "Hoy" a las 21:30 de Santiago, aunque en UTC ya sea mañana', () => {
    // 2026-09-05 21:30 de Santiago = 2026-09-06 00:30 UTC. Agrupar por el día
    // UTC partiría la conversación de la noche en dos.
    expect(etiquetaDiaChat('2026-09-06T00:30:00Z', ahora)).toBe('Hoy')
  })

  it('dice "Ayer" para el día anterior', () => {
    expect(etiquetaDiaChat('2026-09-04T14:00:00Z', ahora)).toBe('Ayer')
  })

  it('escribe la fecha sin año cuando es el mismo año', () => {
    const etiqueta = etiquetaDiaChat('2026-08-29T14:00:00Z', ahora)

    expect(etiqueta).toContain('29')
    expect(etiqueta).toContain('ago')
    expect(etiqueta).not.toContain('2026')
    expect(etiqueta).not.toContain(',')
  })

  it('incluye el año cuando el mensaje es de otro año', () => {
    expect(etiquetaDiaChat('2025-12-24T14:00:00Z', ahora)).toContain('2025')
  })
})

describe('abreDiaNuevo', () => {
  it('es true cuando no hay mensaje previo', () => {
    expect(abreDiaNuevo('2026-09-05T12:00:00Z')).toBe(true)
    expect(abreDiaNuevo('2026-09-05T12:00:00Z', null)).toBe(true)
  })

  it('es false entre dos mensajes del mismo día de Santiago', () => {
    expect(abreDiaNuevo('2026-09-05T18:00:00Z', '2026-09-05T13:00:00Z')).toBe(false)
  })

  it('es true al cruzar la medianoche de Santiago', () => {
    // 22:00 de Santiago del día 4 (UTC-4) vs. 01:00 de Santiago del día 5.
    expect(abreDiaNuevo('2026-09-05T05:00:00Z', '2026-09-05T02:00:00Z')).toBe(true)
  })
})

describe('fechaHoraSantiago', () => {
  it('pasa un instante UTC a la hora de Santiago, no a la de quien ejecuta', () => {
    // 2026-09-05T22:30:00Z son las 18:30 en Santiago (UTC-4).
    expect(fechaHoraSantiago('2026-09-05T22:30:00Z')).toBe('5 de septiembre, 18:30')
  })

  it('el caso que rompía: pasada la medianoche UTC ya es OTRO día', () => {
    // A las 02:00 UTC del 6 en Santiago siguen siendo las 22:00 del 5. Con
    // `format` sobre la zona del servidor (UTC) esto decía "6 de septiembre".
    expect(fechaHoraSantiago('2026-09-06T02:00:00Z')).toBe('5 de septiembre, 22:00')
  })

  it('da lo MISMO se le pase el string o el Date, que es lo que evita el desajuste', () => {
    const iso = '2026-09-05T22:30:00Z'
    expect(fechaHoraSantiago(iso)).toBe(fechaHoraSantiago(new Date(iso)))
  })

  it('una fecha ilegible devuelve vacío en vez de "Invalid Date" en pantalla', () => {
    expect(fechaHoraSantiago('no-es-fecha')).toBe('')
  })
})

