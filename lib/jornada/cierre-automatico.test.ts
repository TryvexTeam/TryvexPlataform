import { describe, expect, it } from 'vitest'

import { HORAS_MAXIMAS, jornadasParaCerrar } from './cierre-automatico'

const H = 3_600_000
const AHORA = new Date('2026-09-12T06:00:00Z')
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * H).toISOString()

const j = (id: string, horas: number) => ({
  id,
  integrante_id: `i-${id}`,
  entrada_at: haceHoras(horas),
})

describe('jornadasParaCerrar', () => {
  it('deja en paz una jornada normal', () => {
    expect(jornadasParaCerrar([j('a', 6)], AHORA)).toHaveLength(0)
  })

  it('cierra la que lleva más del máximo', () => {
    const [c] = jornadasParaCerrar([j('a', 20)], AHORA)
    expect(c.id).toBe('a')
    expect(c.horas).toBe(HORAS_MAXIMAS)
  })

  it('justo en el límite todavía NO se cierra', () => {
    // Alguien que de verdad trabajó 12 horas no merece que le recorten el día.
    expect(jornadasParaCerrar([j('a', HORAS_MAXIMAS)], AHORA)).toHaveLength(0)
  })

  it('la salida es entrada + máximo, NO la hora en que corre el cron', () => {
    // Si entró a las 9 y el cron corre a las 3 AM, poner la salida a las 3 AM
    // le inventaría 18 horas que no trabajó.
    const [c] = jornadasParaCerrar([j('a', 20)], AHORA)
    const entrada = new Date(haceHoras(20)).getTime()
    expect(new Date(c.salida_at).getTime()).toBe(entrada + HORAS_MAXIMAS * H)
    expect(new Date(c.salida_at).getTime()).toBeLessThan(AHORA.getTime())
  })

  it('una fecha de entrada corrupta no rompe el cierre de las demás', () => {
    const salida = jornadasParaCerrar(
      [{ id: 'mala', integrante_id: 'x', entrada_at: 'no-es-fecha' }, j('b', 20)],
      AHORA,
    )
    expect(salida.map((s) => s.id)).toEqual(['b'])
  })

  it('el máximo se puede ajustar', () => {
    expect(jornadasParaCerrar([j('a', 9)], AHORA, 8)).toHaveLength(1)
    expect(jornadasParaCerrar([j('a', 9)], AHORA, 10)).toHaveLength(0)
  })
})
