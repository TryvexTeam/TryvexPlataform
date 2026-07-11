import { describe, it, expect } from 'vitest'
import { normalizarTelefono, construirLinkWhatsApp } from './telefono'

describe('normalizarTelefono', () => {
  it('agrega 56 a móvil chileno de 9 dígitos', () => expect(normalizarTelefono('987654321')).toBe('56987654321'))
  it('respeta números que ya traen 56', () => expect(normalizarTelefono('+56 9 8765 4321')).toBe('56987654321'))
  it('asume móvil en 8 dígitos', () => expect(normalizarTelefono('87654321')).toBe('56987654321'))
  it('rechaza basura corta', () => expect(normalizarTelefono('123')).toBeNull())
  it('rechaza null', () => expect(normalizarTelefono(null)).toBeNull())
})

describe('construirLinkWhatsApp', () => {
  it('arma el link con texto urlencoded', () =>
    expect(construirLinkWhatsApp('987654321', 'hola ¿qué tal?')).toBe(
      'https://wa.me/56987654321?text=hola%20%C2%BFqu%C3%A9%20tal%3F'))
  it('null si el teléfono no sirve', () => expect(construirLinkWhatsApp('12', 'hola')).toBeNull())
})
