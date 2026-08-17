import { describe, it, expect } from 'vitest'
import { parsearPermitidos, estaPermitido } from './permitidos.js'

describe('parsearPermitidos', () => {
  it('sin variable no hay filtro', () => {
    expect(parsearPermitidos(undefined)).toEqual([])
    expect(parsearPermitidos('')).toEqual([])
    expect(parsearPermitidos('   ')).toEqual([])
  })

  it('separa por comas y limpia espacios', () => {
    expect(parsearPermitidos('56911111111, 56922222222')).toEqual(['56911111111', '56922222222'])
  })

  it('se queda solo con los digitos', () => {
    expect(parsearPermitidos('+56 9 1111 1111')).toEqual(['56911111111'])
  })

  it('descarta entradas vacias entre comas', () => {
    expect(parsearPermitidos('56911111111,,')).toEqual(['56911111111'])
  })
})

describe('estaPermitido', () => {
  const lista = ['56911111111']

  it('lista vacia = pasa todo (modo prueba apagado)', () => {
    expect(estaPermitido('56999999999', [])).toBe(true)
  })

  it('deja pasar al que esta en la lista', () => {
    expect(estaPermitido('56911111111', lista)).toBe(true)
  })

  it('bloquea al que no esta', () => {
    expect(estaPermitido('56999999999', lista)).toBe(false)
  })

  it('compara sin importar el formato', () => {
    expect(estaPermitido('+56 9 1111 1111', lista)).toBe(true)
  })

  it('un numero nulo o vacio nunca pasa el filtro', () => {
    expect(estaPermitido(null, lista)).toBe(false)
    expect(estaPermitido('', lista)).toBe(false)
  })

  it('con lista vacia, un numero nulo tampoco rompe', () => {
    expect(estaPermitido(null, [])).toBe(true)
  })
})
