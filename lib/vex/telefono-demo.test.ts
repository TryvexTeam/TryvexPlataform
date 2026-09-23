import { describe, expect, it } from 'vitest'
import { normalizarTelefonoDemo } from './telefono-demo'

describe('normalizarTelefonoDemo', () => {
  it.each([
    ['+56 9 8765 2232', '56987652232'],
    ['987652232', '56987652232'],
    ['56987652232', '56987652232'],
    ['abc', null],
    ['123', null],
    ['', null],
    ['12345678', '12345678'],
    ['123456789', '123456789'],
    ['123456789012345', '123456789012345'],
    ['1234567890123456', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarTelefonoDemo(entrada)).toBe(esperado)
  })
})
