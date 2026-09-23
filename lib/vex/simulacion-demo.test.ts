import { describe, it, expect } from 'vitest'
import { iniciales, perfilDeRubro, rubroDelGuion, simularConversacion } from './simulacion-demo'
import { armarGuionDemo } from './guion-demo'

describe('perfilDeRubro', () => {
  it('cada rubro recibe el flujo que le corresponde, con o sin tildes', () => {
    expect(perfilDeRubro('Barbería').tipo).toBe('reserva')
    expect(perfilDeRubro('PANADERIAS').tipo).toBe('encargo')
    expect(perfilDeRubro('Ferretería').tipo).toBe('cotizacion')
    expect(perfilDeRubro('Taller de reparación de automóviles').tipo).toBe('cotizacion')
  })

  it('un rubro desconocido cae en una consulta genérica', () => {
    expect(perfilDeRubro('soluciones').tipo).toBe('consulta')
    expect(perfilDeRubro(null).tipo).toBe('consulta')
  })
})

describe('rubroDelGuion', () => {
  it('lee el rubro del guion que arma el sistema', () => {
    const guion = armarGuionDemo({
      nombre_negocio: 'Barbería Gold', categoria_google: 'Barbería', nicho: null, localidad: null,
      horario: null, url_web: null, instagram: null, web_capacidades: null,
    })
    expect(rubroDelGuion(guion)).toBe('Barbería')
  })

  it('un guion escrito a mano sin rubro devuelve null', () => {
    expect(rubroDelGuion('Eres el asistente de un local.')).toBeNull()
  })
})

describe('simularConversacion', () => {
  it('el asistente se presenta con el nombre del negocio', () => {
    const c = simularConversacion('Barbería Gold', 'Barbería')
    expect(c[0].de).toBe('cliente')
    expect(c.find((m) => m.de === 'asistente')?.texto).toContain('Barbería Gold')
  })

  it('una panadería no ofrece reservar hora', () => {
    const texto = simularConversacion('Panadería San José', 'Panadería').map((m) => m.texto).join(' ')
    expect(texto).not.toMatch(/\bhora\b|reserv/i)
  })

  it('el asistente nunca da un precio ni confirma disponibilidad por su cuenta', () => {
    for (const r of ['Barbería', 'Panadería', 'Ferretería', 'soluciones', 'Dentista']) {
      const respuestas = simularConversacion('Local', r).filter((m) => m.de === 'asistente').map((m) => m.texto).join(' ')
      expect(respuestas, r).not.toMatch(/\$\s?\d|\d+\s?(pesos|lucas|mil)\b/i)
      expect(respuestas, r).toMatch(/(el|al) equipo/i)
    }
  })

  it('las conversaciones alternan cliente y asistente, empezando por el cliente', () => {
    for (const r of ['Barbería', 'Panadería', 'Ferretería', 'soluciones']) {
      simularConversacion('Local', r).forEach((m, i) => expect(m.de, r).toBe(i % 2 === 0 ? 'cliente' : 'asistente'))
    }
  })

  it('sin nombre no deja el saludo vacío', () => {
    expect(simularConversacion('  ', 'Barbería')[1].texto).toContain('su negocio')
  })
})

describe('iniciales', () => {
  it('dos iniciales, saltando lo que no son palabras', () => {
    expect(iniciales('Barbería Gold')).toBe('BG')
    expect(iniciales('Óptica & Kairos')).toBe('ÓK')
    expect(iniciales('')).toBe('·')
  })
})
