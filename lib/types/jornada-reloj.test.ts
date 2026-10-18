import { describe, expect, it } from 'vitest'

import { enPausa, segundosTrabajados } from './jornada'

/**
 * El reloj de la portada ("quién está en jornada y cuánto lleva") usa estas dos
 * funciones, las mismas que la página de jornada. Estos tests fijan que sigan
 * contando igual para un tramo abierto, que es el caso de la portada — el que
 * antes no se usaba, porque ahí las jornadas ya estaban cerradas.
 */
const H = 3_600_000

function haceHoras(h: number): string {
  return new Date(Date.now() - h * H).toISOString()
}

describe('segundosTrabajados en una jornada ABIERTA', () => {
  it('cuenta desde la entrada hasta ahora', () => {
    const s = segundosTrabajados({ entrada_at: haceHoras(3), salida_at: null, pausas: [] })
    expect(s).toBeGreaterThan(3 * 3600 - 5)
    expect(s).toBeLessThan(3 * 3600 + 5)
  })

  it('descuenta una pausa ya terminada', () => {
    const s = segundosTrabajados({
      entrada_at: haceHoras(4),
      salida_at: null,
      pausas: [{ inicio: haceHoras(3), fin: haceHoras(2) }],
    })
    // 4 horas menos 1 de pausa
    expect(Math.round(s / 3600)).toBe(3)
  })

  it('descuenta la pausa EN CURSO: el reloj no corre mientras almuerzas', () => {
    const s = segundosTrabajados({
      entrada_at: haceHoras(5),
      salida_at: null,
      pausas: [{ inicio: haceHoras(2) }],
    })
    expect(Math.round(s / 3600)).toBe(3)
  })

  it('sin pausas declaradas no revienta', () => {
    expect(segundosTrabajados({ entrada_at: haceHoras(1) })).toBeGreaterThan(0)
    expect(segundosTrabajados({ entrada_at: haceHoras(1), pausas: null })).toBeGreaterThan(0)
  })
})

describe('enPausa', () => {
  it('una pausa sin fin es una pausa en curso', () => {
    expect(enPausa({ entrada_at: haceHoras(2), pausas: [{ inicio: haceHoras(1) }] })).toBe(true)
  })

  it('una pausa cerrada no deja a nadie en pausa', () => {
    expect(
      enPausa({ entrada_at: haceHoras(3), pausas: [{ inicio: haceHoras(2), fin: haceHoras(1) }] }),
    ).toBe(false)
  })

  it('sin pausas, no está en pausa', () => {
    expect(enPausa({ entrada_at: haceHoras(1), pausas: [] })).toBe(false)
    expect(enPausa({ entrada_at: haceHoras(1) })).toBe(false)
  })
})
