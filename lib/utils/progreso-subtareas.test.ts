import { describe, it, expect } from 'vitest'
import { agruparProgresoSubtareas, porcentajeProgreso } from './progreso-subtareas'

describe('agruparProgresoSubtareas', () => {
  it('cuenta hechas y total por tarea', () => {
    const mapa = agruparProgresoSubtareas([
      { tarea_id: 'a', completada: true },
      { tarea_id: 'a', completada: false },
      { tarea_id: 'a', completada: true },
      { tarea_id: 'b', completada: false },
    ])
    expect(mapa).toEqual({ a: { hechas: 2, total: 3 }, b: { hechas: 0, total: 1 } })
  })

  it('sin filas devuelve un mapa vacío', () => {
    expect(agruparProgresoSubtareas([])).toEqual({})
  })

  it('una tarea sin subtareas no aparece en el mapa', () => {
    // Es la diferencia entre "0 de 5 pasos" y "no usa pasos": la tarjeta solo
    // muestra el avance cuando la tarea está en el mapa.
    const mapa = agruparProgresoSubtareas([{ tarea_id: 'a', completada: false }])
    expect(mapa['b']).toBeUndefined()
  })
})

describe('porcentajeProgreso', () => {
  it('redondea al entero más cercano', () => {
    expect(porcentajeProgreso({ hechas: 1, total: 3 })).toBe(33)
    expect(porcentajeProgreso({ hechas: 2, total: 3 })).toBe(67)
  })

  it('llega a 100 cuando están todas', () => {
    expect(porcentajeProgreso({ hechas: 8, total: 8 })).toBe(100)
  })

  it('con total 0 devuelve 0 y no NaN', () => {
    expect(porcentajeProgreso({ hechas: 0, total: 0 })).toBe(0)
  })
})
