import { describe, it, expect } from 'vitest'
import { telefonoLlamable } from './calidad'

/**
 * La auditoría del 28-ago encontró 98 teléfonos malos entre los 556 leads, 76
 * de ellos de 7 dígitos. El semáforo los pintaba verde igual, y del otro lado
 * `lib/vex/telefono` le inventaba un "9" a los de 8 dígitos y los convertía en
 * el móvil de otra persona. Los dos lados del mismo número incompleto,
 * mintiendo distinto.
 */
describe('telefonoLlamable', () => {
  it('acepta un móvil chileno de 9 dígitos', () =>
    expect(telefonoLlamable('987654321')).toBe(true))

  it('acepta un móvil con código de país', () =>
    expect(telefonoLlamable('+56 9 8765 4321')).toBe(true))

  it('acepta un fijo con código de área (9 dígitos)', () =>
    expect(telefonoLlamable('223456789')).toBe(true))

  it('NO acepta 8 dígitos: es un fijo al que le falta el código de área', () =>
    expect(telefonoLlamable('23456789')).toBe(false))

  it('NO acepta los de 7 dígitos (76 leads los tienen y no se pueden llamar)', () =>
    expect(telefonoLlamable('2345678')).toBe(false))

  it('NO acepta vacío ni nulo', () => {
    expect(telefonoLlamable('')).toBe(false)
    expect(telefonoLlamable(null)).toBe(false)
    expect(telefonoLlamable(undefined)).toBe(false)
  })
})
