import { describe, it, expect } from 'vitest'
import { clavesDeAcuse } from './emparejar'

/**
 * El caso real: el 29-ago se mergeó el endpoint del acuse y no podía emparejar
 * nada. `/api/wa/send` guardaba en `wa_message_id` la referencia del agente —un
 * entero de su cola— y el acuse llegaba con el id de WhatsApp (`3EB0...`).
 * Nunca coincidían: 404 sistemático, en el 100% de los envíos.
 */
describe('clavesDeAcuse', () => {
  it('busca por el id de WhatsApp y por la referencia del agente', () =>
    expect(clavesDeAcuse('3EB07678C588F5C8D9351C', 4821)).toEqual([
      '3EB07678C588F5C8D9351C',
      '4821',
    ]))

  it('acepta la referencia como número o como texto', () =>
    expect(clavesDeAcuse('3EB0AA', '4821')).toEqual(['3EB0AA', '4821']))

  it('sin referencia busca solo por el id real (envíos que sí lo guardaron)', () =>
    expect(clavesDeAcuse('3EB0AA')).toEqual(['3EB0AA']))

  it('no duplica si el agente manda lo mismo en los dos campos', () =>
    expect(clavesDeAcuse('3EB0AA', '3EB0AA')).toEqual(['3EB0AA']))

  it('ignora referencias vacías o nulas en vez de buscar por cadena vacía', () => {
    expect(clavesDeAcuse('3EB0AA', '')).toEqual(['3EB0AA'])
    expect(clavesDeAcuse('3EB0AA', null)).toEqual(['3EB0AA'])
    expect(clavesDeAcuse('3EB0AA', undefined)).toEqual(['3EB0AA'])
  })

  it('recorta espacios: un id con espacios no emparejaría nada', () =>
    expect(clavesDeAcuse('  3EB0AA  ', '  4821 ')).toEqual(['3EB0AA', '4821']))

  it('sin id ni referencia no devuelve claves (mejor 400 que buscar por vacío)', () => {
    expect(clavesDeAcuse('', null)).toEqual([])
    expect(clavesDeAcuse(null, undefined)).toEqual([])
  })

  it('la referencia sola alcanza para emparejar', () =>
    expect(clavesDeAcuse('', 4821)).toEqual(['4821']))
})
