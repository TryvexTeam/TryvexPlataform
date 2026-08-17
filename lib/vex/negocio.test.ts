import { describe, it, expect } from 'vitest'
import { leerReputacion, leerComuna } from './negocio'

describe('leerReputacion', () => {
  it('lee el formato del scraper: calificación, salto de línea, reseñas', () => {
    // El caso real que el modelo convirtió en "256 personas buscan barberías
    // como la tuya cada semana".
    expect(leerReputacion('4,8\n(256)')).toEqual({ calificacion: 4.8, resenas: 256 })
  })

  it('acepta punto decimal y separador de miles', () => {
    expect(leerReputacion('4.9\n(1.204)')).toEqual({ calificacion: 4.9, resenas: 1204 })
  })

  it('acepta calificación entera', () => {
    expect(leerReputacion('5\n(12)')).toEqual({ calificacion: 5, resenas: 12 })
  })

  it('sin dato, no inventa', () => {
    expect(leerReputacion(null)).toBeNull()
    expect(leerReputacion('')).toBeNull()
    expect(leerReputacion('   ')).toBeNull()
  })

  it('texto libre que no es una reputación se descarta', () => {
    expect(leerReputacion('Atiende con reserva')).toBeNull()
    expect(leerReputacion('cerrado los lunes')).toBeNull()
  })

  it('una calificación imposible se descarta en vez de usarse', () => {
    expect(leerReputacion('9,9\n(10)')).toBeNull()
    expect(leerReputacion('0\n(10)')).toBeNull()
  })

  it('sin reseñas no hay reputación que citar', () => {
    expect(leerReputacion('4,8')).toBeNull()
    expect(leerReputacion('4,8\n(0)')).toBeNull()
  })
})

describe('leerComuna', () => {
  it('saca la comuna del tramo con código postal', () => {
    // El caso real: el modelo dijo "En Pto San Francisco", que es un pasaje.
    expect(
      leerComuna('Pto San Francisco, Av. El Peral 3642 con, 8150000 Puente Alto, Región Metropolitana')
    ).toBe('Puente Alto')
  })

  it('funciona con otra dirección de la misma cartera', () => {
    expect(
      leerComuna('Díaz Sagredo 995, 8500741 Quinta Normal, Región Metropolitana')
    ).toBe('Quinta Normal')
  })

  it('sin código postal, usa el penúltimo tramo si no parece una calle', () => {
    expect(leerComuna('Local 5, Maipú, Región Metropolitana')).toBe('Maipú')
  })

  it('no confunde una calle con una comuna', () => {
    expect(leerComuna('Av. Matta 1200, Región Metropolitana')).toBeNull()
  })

  it('sin dato, no inventa', () => {
    expect(leerComuna(null)).toBeNull()
    expect(leerComuna('')).toBeNull()
    expect(leerComuna('Santiago')).toBeNull()
  })
})
