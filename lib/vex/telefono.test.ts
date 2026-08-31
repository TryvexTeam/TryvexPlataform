import { describe, it, expect } from 'vitest'
import { normalizarTelefono, construirLinkWhatsApp } from './telefono'

describe('normalizarTelefono', () => {
  it('agrega 56 a móvil chileno de 9 dígitos', () => expect(normalizarTelefono('987654321')).toBe('56987654321'))
  it('respeta números que ya traen 56', () => expect(normalizarTelefono('+56 9 8765 4321')).toBe('56987654321'))
  // Este test decía `it('asume móvil en 8 dígitos')` y exigía '56987654321'.
  // Consagraba el bug: 8 dígitos en Chile es casi siempre un fijo sin código de
  // área, y anteponerle "9" lo convierte en el celular de otra persona. Como
  // esta función está en el camino de envío, ese número inventado era a quién
  // le llegaba el WhatsApp. Se cambia el test a propósito y con motivo — es la
  // única razón válida para tocar uno que pasaba: codificaba el defecto.
  it('NO inventa un móvil con 8 dígitos (era un fijo sin código de área)', () =>
    expect(normalizarTelefono('87654321')).toBeNull())
  it('deja pasar los que ya traen código de país', () =>
    expect(normalizarTelefono('5491123456789')).toBe('5491123456789'))
  it('rechaza basura corta', () => expect(normalizarTelefono('123')).toBeNull())
  it('rechaza null', () => expect(normalizarTelefono(null)).toBeNull())
})

describe('construirLinkWhatsApp', () => {
  it('arma el link con texto urlencoded', () =>
    expect(construirLinkWhatsApp('987654321', 'hola ¿qué tal?')).toBe(
      'https://wa.me/56987654321?text=hola%20%C2%BFqu%C3%A9%20tal%3F'))
  it('null si el teléfono no sirve', () => expect(construirLinkWhatsApp('12', 'hola')).toBeNull())
})
