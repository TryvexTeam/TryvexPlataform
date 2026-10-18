import { describe, expect, it } from 'vitest'
import { formatearTelefonoDemo, normalizarTelefonoDemo } from './telefono-demo'

describe('normalizarTelefonoDemo — lo que la gente escribe de verdad', () => {
  it.each([
    // Celular chileno, de todas las formas en que llega
    ['+56 9 8765 2232', '56987652232'],
    ['+56987652232', '56987652232'],
    ['56987652232', '56987652232'],
    ['987652232', '56987652232'],
    ['9 8765 2232', '56987652232'],
    ['9-8765-2232', '56987652232'],
    ['(+56) 9 8765 2232', '56987652232'],
    ['+56 (9) 8765-2232', '56987652232'],
    ['0056 9 8765 2232', '56987652232'],
    // Con el 0 de larga distancia antepuesto, como se marcaba antes
    ['09 8765 2232', '56987652232'],
    ['+56 09 8765 2232', '56987652232'],
    // Pegado desde WhatsApp o una planilla, con espacios raros y texto
    ['‪+56 9 8765 2232‬', '56987652232'],
    ['+56 9 8765 2232', '56987652232'],
    ['Tel: +56 9 8765 2232', '56987652232'],
    // Extranjeros: se aceptan si vienen con + o 00
    ['+54 9 11 2345 6789', '5491123456789'],
    ['+1 (415) 555-0132', '14155550132'],
    ['0034 612 345 678', '34612345678'],
  ])('%j → %s', (entrada, esperado) => {
    expect(normalizarTelefonoDemo(entrada)).toBe(esperado)
  })

  it.each([
    // Ambiguos: mejor pedir que lo revise que guardar un número que Vex nunca va a reconocer
    ['8765 2232'], // 8 dígitos: ¿le falta el 9? ¿es un fijo sin código?
    ['98765223'], // celular con un dígito de menos
    ['9876522321'], // celular con un dígito de más
    ['5698765223'], // 56 + celular incompleto
    ['123456789'], // 9 dígitos que no son un celular chileno
    ['abc'],
    ['123'],
    [''],
    ['+1234567890123456'], // más de 15
  ])('%j → null', (entrada) => {
    expect(normalizarTelefonoDemo(entrada)).toBeNull()
  })
})

describe('formatearTelefonoDemo — cómo se le muestra', () => {
  it('celular chileno en el formato de siempre', () => {
    expect(formatearTelefonoDemo('56987652232')).toBe('+56 9 8765 2232')
  })
  it('el resto, con + y sin inventar agrupaciones', () => {
    expect(formatearTelefonoDemo('14155550132')).toBe('+14155550132')
  })
})
