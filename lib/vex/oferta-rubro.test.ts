import { describe, it, expect } from 'vitest'
import { ofertaParaRubro } from './oferta-rubro'

describe('ofertaParaRubro', () => {
  it('calza con y sin tildes, singular y plural, mayusculas', () => {
    expect(ofertaParaRubro('Óptica')).toEqual(ofertaParaRubro('opticas'))
    expect(ofertaParaRubro('BARBERÍAS')).not.toBeNull()
    expect(ofertaParaRubro('Taller de reparación de automóviles')?.servicio).toMatch(/presupuestos/)
    expect(ofertaParaRubro('Centro de estética')?.servicio).toMatch(/hora/)
  })

  it('cubre los rubros frecuentes de la cartera', () => {
    const rubros = ['peluquería', 'barbería', 'restaurante', 'cafetería', 'farmacia', 'clínica dental',
      'veterinaria', 'ferretería', 'panadería', 'pastelería', 'óptica', 'lavandería',
      'taller mecánico', 'abogado', 'contadores', 'gimnasio', 'kinesiólogo']
    for (const r of rubros) expect(ofertaParaRubro(r), r).not.toBeNull()
  })

  it('un rubro que no esta devuelve null', () => {
    expect(ofertaParaRubro('soluciones')).toBeNull()
    expect(ofertaParaRubro('')).toBeNull()
    expect(ofertaParaRubro(null)).toBeNull()
  })

  it('ferreteria y panaderia no ofrecen reservas', () => {
    for (const r of ['Ferretería', 'Panadería']) {
      const o = ofertaParaRubro(r)
      expect(o?.servicio, r).not.toMatch(/reserv|agenda|hora/i)
      expect(o?.prohibido, r).toMatch(/NO le ofrezcas reservar hora/)
    }
  })

  it('farmacia y salud llevan su prohibicion legal', () => {
    expect(ofertaParaRubro('Farmacia')?.prohibido).toMatch(/ISP/)
    expect(ofertaParaRubro('Dentista')?.prohibido).toMatch(/diagnosticar/)
  })

  it('solo nombra servicios del catalogo real', () => {
    const catalogo = /^(Automatizacion|Landing o sitio web|Sistema a medida|Inteligencia aplicada):/
    const rubros = ['barberia', 'restaurante', 'farmacia', 'dentista', 'veterinaria', 'optica',
      'ferreteria', 'panaderia', 'lavanderia', 'taller', 'gimnasio', 'abogado', 'contador',
      'floreria', 'joyeria']
    for (const r of rubros) expect(ofertaParaRubro(r)?.servicio, r).toMatch(catalogo)
  })
})
