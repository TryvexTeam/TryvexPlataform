import { describe, it, expect } from 'vitest'
import { parseFechaLocal } from './fecha-santiago'

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
