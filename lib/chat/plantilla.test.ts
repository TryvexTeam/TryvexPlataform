import { describe, expect, it } from 'vitest'
import { resolverPlantilla, tokenNombre } from './plantilla'

const ID = '74d0b347-c44e-4483-8a5d-069f56d464e1'

describe('resolverPlantilla', () => {
  it('pinta el nombre actual del integrante', () => {
    const texto = `¡Bienvenido/a a Tryvex, ${tokenNombre(ID)}! 👋`
    expect(resolverPlantilla(texto, () => 'Cristian De La Fuente')).toBe('¡Bienvenido/a a Tryvex, Cristian! 👋')
    expect(resolverPlantilla(texto, () => 'Cris')).toBe('¡Bienvenido/a a Tryvex, Cris! 👋')
  })
  it('usa un genérico si el integrante no está', () => {
    expect(resolverPlantilla(tokenNombre(ID), () => undefined)).toBe('compañero/a')
  })
  it('deja intacto el texto sin plantilla', () => {
    expect(resolverPlantilla('hola {nombre}', () => 'X')).toBe('hola {nombre}')
  })
})
