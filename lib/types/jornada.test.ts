import { describe, expect, test } from 'vitest'
import { enPausa, formatearDuracion, segundosTrabajados, type Jornada } from './jornada'

function jornada(parcial: Partial<Jornada>): Jornada {
  return {
    id: 'j1',
    integrante_id: 'i1',
    entrada_at: '2026-08-03T13:00:00Z',
    salida_at: null,
    pausas: [],
    nota: null,
    origen: 'web',
    created_at: '2026-08-03T13:00:00Z',
    updated_at: '2026-08-03T13:00:00Z',
    ...parcial,
  }
}

const AHORA = new Date('2026-08-03T17:00:00Z')

describe('segundosTrabajados', () => {
  test('cuenta hasta ahora mientras la jornada sigue abierta', () => {
    expect(segundosTrabajados(jornada({}), AHORA)).toBe(4 * 3600)
  })

  test('cuenta hasta la salida cuando la jornada está cerrada', () => {
    const cerrada = jornada({ salida_at: '2026-08-03T15:30:00Z' })
    expect(segundosTrabajados(cerrada, AHORA)).toBe(2.5 * 3600)
  })

  test('descuenta las pausas cerradas', () => {
    const conPausa = jornada({
      pausas: [{ inicio: '2026-08-03T14:00:00Z', fin: '2026-08-03T14:30:00Z' }],
    })
    expect(segundosTrabajados(conPausa, AHORA)).toBe(3.5 * 3600)
  })

  test('una pausa abierta congela el contador', () => {
    const enPausaAhora = jornada({ pausas: [{ inicio: '2026-08-03T15:00:00Z' }] })
    expect(segundosTrabajados(enPausaAhora, AHORA)).toBe(2 * 3600)
  })

  test('nunca devuelve negativo aunque las pausas excedan el tramo', () => {
    const inconsistente = jornada({
      salida_at: '2026-08-03T13:30:00Z',
      pausas: [{ inicio: '2026-08-03T13:00:00Z', fin: '2026-08-03T18:00:00Z' }],
    })
    expect(segundosTrabajados(inconsistente, AHORA)).toBe(0)
  })
})

describe('enPausa', () => {
  test('es verdadero solo si la última pausa no tiene fin', () => {
    expect(enPausa(jornada({ pausas: [{ inicio: '2026-08-03T15:00:00Z' }] }))).toBe(true)
    expect(
      enPausa(jornada({ pausas: [{ inicio: '2026-08-03T15:00:00Z', fin: '2026-08-03T15:10:00Z' }] })),
    ).toBe(false)
    expect(enPausa(jornada({}))).toBe(false)
  })
})

describe('formatearDuracion', () => {
  test('rellena los minutos con cero a la izquierda', () => {
    expect(formatearDuracion(3 * 3600 + 5 * 60)).toBe('3h 05m')
  })

  test('muestra cero cuando no hay tiempo trabajado', () => {
    expect(formatearDuracion(0)).toBe('0h 00m')
  })
})
