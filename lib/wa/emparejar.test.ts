import { describe, it, expect } from 'vitest'
import { clavesDeAcuse, elegirFilaDelAcuse, esClaveReusable } from './emparejar'

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

/**
 * El caso que viene: la `referencia` del agente es el contador de SU cola —en la
 * base hay 26, 27, 28, 32— y una cola en memoria vuelve a empezar en 1 cuando el
 * agente reinicia. Dos mensajes de leads distintos pueden terminar con la misma
 * referencia, y un `.in()` sin filtro escribiría el acuse sobre la ficha ajena.
 * Nadie lo vería: el update es silencioso y la ficha equivocada avanza.
 *
 * Regla: si el match no es único, NO se adivina. Es la misma que se aplicó al
 * emparejamiento de leads por teléfono el 21-ago.
 */
describe('elegirFilaDelAcuse', () => {
  const fila = (id: string, lead: string | null = 'lead-1') => ({ id, lead_id: lead })

  it('una sola fila: empareja', () =>
    expect(elegirFilaDelAcuse([fila('m1')])).toEqual({ tipo: 'unico', fila: fila('m1') }))

  it('ninguna fila: no hay a qué colgar el acuse', () => {
    expect(elegirFilaDelAcuse([])).toEqual({ tipo: 'ninguno' })
    expect(elegirFilaDelAcuse(null)).toEqual({ tipo: 'ninguno' })
    expect(elegirFilaDelAcuse(undefined)).toEqual({ tipo: 'ninguno' })
  })

  it('dos leads distintos con la misma clave: AMBIGUO, no se elige el primero', () =>
    expect(elegirFilaDelAcuse([fila('m1', 'lead-A'), fila('m2', 'lead-B')])).toEqual({
      tipo: 'ambiguo',
      filas: [fila('m1', 'lead-A'), fila('m2', 'lead-B')],
    }))

  it('dos filas del MISMO lead también es ambiguo: escribiría el id real en las dos', () =>
    expect(elegirFilaDelAcuse([fila('m1'), fila('m2')]).tipo).toBe('ambiguo'))
})

describe('esClaveReusable', () => {
  it('la referencia del agente es un contador: se reusa', () => {
    expect(esClaveReusable('32')).toBe(true)
    expect(esClaveReusable('1')).toBe(true)
  })

  it('el id de WhatsApp es irrepetible: no se reusa', () => {
    expect(esClaveReusable('3EB07678C588F5C8D9351C')).toBe(false)
    expect(esClaveReusable('BAE5A1B2C3D4')).toBe(false)
  })

  it('un id larguísimo de solo dígitos tampoco es un contador de cola', () =>
    expect(esClaveReusable('1756450000123456789')).toBe(false))
})
