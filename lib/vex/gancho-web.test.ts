import { describe, it, expect } from 'vitest'
import { ganchoPorEstadoWeb } from './gancho-web'

describe('ganchoPorEstadoWeb', () => {
  const url = 'https://ejemplo.cl'

  it('en obra: ofrecer terminar lo que empezo, nombrando su direccion', () => {
    const g = ganchoPorEstadoWeb('en_obra', url)
    expect(g).toMatch(/en construccion cuando lo revisamos/)
    expect(g).toMatch(/terminar lo que ya empezo/)
    expect(g).toContain(url)
  })

  it('staging: una version de prueba, no una terminada', () => {
    expect(ganchoPorEstadoWeb('staging', url)).toMatch(/version de prueba/)
  })

  it('caida: se dice con tacto, como aviso', () => {
    const g = ganchoPorEstadoWeb('caida', url)
    expect(g).toMatch(/no cargaba cuando lo revisamos/)
    expect(g).toMatch(/con tacto/)
  })

  it('vacia: el dominio esta pero no muestra nada', () => {
    expect(ganchoPorEstadoWeb('vacia', url)).toMatch(/no mostraba contenido/)
  })

  it('parqueada: el dominio es suyo pero sin sitio', () => {
    expect(ganchoPorEstadoWeb('parqueada', url)).toMatch(/esta a su nombre/)
  })

  it('todos prohiben decir que no tiene web y lo fechan a la revision', () => {
    for (const e of ['en_obra', 'staging', 'caida', 'vacia', 'parqueada']) {
      const g = ganchoPorEstadoWeb(e, url) ?? ''
      expect(g, e).toMatch(/NUNCA digas que "no tiene web"/)
      expect(g, e).toMatch(/cuando lo revisamos/)
    }
  })

  it('sin url no deja parentesis vacios', () => {
    expect(ganchoPorEstadoWeb('en_obra', null)).not.toMatch(/\(\s*\)/)
  })

  it('viva, desconocido, bloqueada y sin estado no dan gancho', () => {
    expect(ganchoPorEstadoWeb('viva', url)).toBeNull()
    expect(ganchoPorEstadoWeb('desconocido', url)).toBeNull()
    expect(ganchoPorEstadoWeb('bloqueada', url)).toBeNull()
    expect(ganchoPorEstadoWeb(null, url)).toBeNull()
    expect(ganchoPorEstadoWeb(undefined, url)).toBeNull()
  })
})
