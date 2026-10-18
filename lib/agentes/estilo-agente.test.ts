import { describe, it, expect } from 'vitest'
import { DEFINICION_TRAJE, TRAJES, estiloPorDefecto, leerEstilo, tonoDe } from './estilo-agente'

describe('estilos de los agentes', () => {
  it('Jarvis va de esmoquin por defecto; el resto, liso', () => {
    expect(estiloPorDefecto('Jarvis').traje).toBe('esmoquin')
    expect(estiloPorDefecto(' jarvis ').traje).toBe('esmoquin')
    expect(estiloPorDefecto('Ariel').traje).toBe('liso')
  })

  it('lo guardado en la base manda sobre el de por defecto', () => {
    expect(leerEstilo({ traje: 'bata' }, 'Jarvis').traje).toBe('bata')
  })

  it('un valor roto o desconocido cae en el de por defecto, sin romper la oficina', () => {
    expect(leerEstilo(null, 'Jarvis').traje).toBe('esmoquin')
    expect(leerEstilo({ traje: 'disfraz' }, 'Ariel').traje).toBe('liso')
    expect(leerEstilo('texto', 'Ariel').traje).toBe('liso')
  })

  it('cada traje tiene su definición completa', () => {
    for (const t of TRAJES) {
      const d = DEFINICION_TRAJE[t]
      expect(d.nombre.length, t).toBeGreaterThan(0)
      for (const parte of [d.cabeza, d.brazos, d.manos, d.piernas]) expect(parte === 'color' || /^#[0-9a-f]{6}$/i.test(parte), t).toBe(true)
    }
  })

  it('"color" se resuelve al color del agente', () => {
    expect(tonoDe('color', '#c9463d')).toBe('#c9463d')
    expect(tonoDe('#17181c', '#c9463d')).toBe('#17181c')
  })
})
