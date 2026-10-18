import { describe, it, expect } from 'vitest'
import { MAX_RECIENTES, agregarReciente, haceSegundos, recientesValidos } from './historial-actividad'

describe('agregarReciente', () => {
  it('la más reciente queda primero', () => {
    const l = agregarReciente([{ h: 'Read · a.ts', at: '1' }], 'Edit · b.ts', '2')
    expect(l.map((r) => r.h)).toEqual(['Edit · b.ts', 'Read · a.ts'])
  })

  it('la misma herramienta seguida no se repite: se actualiza la hora', () => {
    const l = agregarReciente([{ h: 'Edit · b.ts', at: '1' }], 'Edit · b.ts', '2')
    expect(l).toEqual([{ h: 'Edit · b.ts', at: '2' }])
  })

  it('guarda como máximo 8', () => {
    let l: unknown = []
    for (let i = 0; i < 12; i++) l = agregarReciente(l, `Bash · ${i}`, String(i))
    expect((l as unknown[]).length).toBe(MAX_RECIENTES)
    expect((l as Array<{ h: string }>)[0].h).toBe('Bash · 11')
  })

  it('tolera lo que venga mal de la base', () => {
    expect(agregarReciente(null, 'Read · a', '1')).toEqual([{ h: 'Read · a', at: '1' }])
    expect(recientesValidos([{ h: 3 }, 'x', { h: 'ok', at: 'y' }])).toEqual([{ h: 'ok', at: 'y' }])
  })
})

describe('haceSegundos', () => {
  const ahora = Date.parse('2026-09-23T20:00:00Z')
  it('en palabras de persona', () => {
    expect(haceSegundos('2026-09-23T19:59:52Z', ahora)).toBe('hace 8 s')
    expect(haceSegundos('2026-09-23T19:57:00Z', ahora)).toBe('hace 3 min')
    expect(haceSegundos('2026-09-23T18:00:00Z', ahora)).toBe('hace 2 h')
  })
})
