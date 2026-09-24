import { describe, it, expect } from 'vitest'
import { columnasDePantalla, encargosQueCambiaron, haceCuanto, type EncargoPantalla } from './pantalla-cola'

const ahora = Date.parse('2026-09-23T18:00:00-03:00')
const e = (id: string, estado: EncargoPantalla['estado'], extra: Partial<EncargoPantalla> = {}): EncargoPantalla => ({
  id, agenteId: 'a', titulo: id, estado, prioridad: 'media',
  creadoAt: '2026-09-23T10:00:00-03:00', respondidoAt: null, ...extra,
})

describe('columnasDePantalla', () => {
  it('reparte por estado y deja fuera lo rechazado', () => {
    const c = columnasDePantalla([e('1', 'encolado'), e('2', 'aprobado'), e('3', 'en_curso'), e('4', 'rechazado')], ahora)
    expect(c.encolado.map((x) => x.id)).toEqual(['1'])
    expect(c.aprobado.map((x) => x.id)).toEqual(['2'])
    expect(c.en_curso.map((x) => x.id)).toEqual(['3'])
    expect(Object.values(c).flat().some((x) => x.id === '4')).toBe(false)
  })

  it('de lo respondido, solo lo de hoy', () => {
    const c = columnasDePantalla([
      e('hoy', 'respondido', { respondidoAt: '2026-09-23T12:00:00-03:00' }),
      e('ayer', 'respondido', { respondidoAt: '2026-09-22T12:00:00-03:00' }),
    ], ahora)
    expect(c.respondido.map((x) => x.id)).toEqual(['hoy'])
  })

  it('lo urgente arriba; a igual urgencia, lo más nuevo', () => {
    const c = columnasDePantalla([
      e('viejo', 'encolado', { creadoAt: '2026-09-23T08:00:00-03:00' }),
      e('nuevo', 'encolado', { creadoAt: '2026-09-23T11:00:00-03:00' }),
      e('urgente', 'encolado', { prioridad: 'alta', creadoAt: '2026-09-23T07:00:00-03:00' }),
    ], ahora)
    expect(c.encolado.map((x) => x.id)).toEqual(['urgente', 'nuevo', 'viejo'])
  })
})

describe('haceCuanto', () => {
  it('en palabras de persona', () => {
    expect(haceCuanto('2026-09-23T17:59:50-03:00', ahora)).toBe('recién')
    expect(haceCuanto('2026-09-23T17:55:00-03:00', ahora)).toBe('hace 5 min')
    expect(haceCuanto('2026-09-23T15:00:00-03:00', ahora)).toBe('hace 3 h')
    expect(haceCuanto('2026-09-20T18:00:00-03:00', ahora)).toBe('hace 3 d')
  })
})

describe('encargosQueCambiaron', () => {
  it('los nuevos y los que cambiaron de estado; no los que siguen igual', () => {
    const antes = new Map<string, EncargoPantalla['estado']>([['1', 'encolado'], ['2', 'aprobado']])
    const cambiados = encargosQueCambiaron(antes, [e('1', 'encolado'), e('2', 'en_curso'), e('3', 'encolado')])
    expect(cambiados.map((x) => x.id)).toEqual(['2', '3'])
  })
})
