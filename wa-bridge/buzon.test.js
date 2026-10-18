import { describe, it, expect } from 'vitest'
import { aJobDeEnvio } from './buzon.js'

const fila = {
  id: 'aaaaaaaa-0000-0000-0000-000000000000',
  lead_id: 'bbbbbbbb-0000-0000-0000-000000000000',
  texto: 'hola',
  enviado_por: 'Cristian',
}

describe('aJobDeEnvio', () => {
  it('arma el envio con el telefono del lead', () => {
    const job = aJobDeEnvio(fila, { telefono: '+56 9 1111 1111' })
    expect(job).toEqual({
      telefono: '56911111111',
      texto: 'hola',
      lead_id: fila.lead_id,
      cliente_id: null,
      es_bot: false,
      enviado_por: 'Cristian',
      integrante_id: null,
    })
  })

  it('un telefono chileno sin el 56 se completa, no se manda a un numero inexistente', () => {
    expect(aJobDeEnvio(fila, { telefono: '912345678' }).telefono).toBe('56912345678')
    expect(aJobDeEnvio(fila, { telefono: '9 1234 5678' }).telefono).toBe('56912345678')
  })

  it('un telefono demasiado corto no se manda', () => {
    expect(aJobDeEnvio(fila, { telefono: '12345' })).toBeNull()
  })

  it('9 digitos que no son un numero chileno no se mandan', () => {
    expect(aJobDeEnvio(fila, { telefono: '123456789' })).toBeNull()
    expect(aJobDeEnvio(fila, { telefono: '012345678' })).toBeNull()
  })

  it('56 seguido de un largo que no calza no se manda', () => {
    expect(aJobDeEnvio(fila, { telefono: '5691234567' })).toBeNull()
    expect(aJobDeEnvio(fila, { telefono: '569123456789' })).toBeNull()
    expect(aJobDeEnvio(fila, { telefono: '56112345678' })).toBeNull()
  })

  it('un numero extranjero con su codigo de pais pasa tal cual', () => {
    expect(aJobDeEnvio(fila, { telefono: '+54 9 11 2345 6789' }).telefono).toBe('5491123456789')
  })

  it('8 digitos no se completa: seria inventarle un celular a un fijo', () => {
    expect(aJobDeEnvio(fila, { telefono: '22345678' })).toBeNull()
  })

  it('pasa la autoria real hasta el envio', () => {
    const job = aJobDeEnvio({ ...fila, integrante_id: 'cccccccc-0000-0000-0000-000000000000' }, { telefono: '56911111111' })
    expect(job.integrante_id).toBe('cccccccc-0000-0000-0000-000000000000')
  })

  it('sin lead no hay envio', () => {
    expect(aJobDeEnvio(fila, null)).toBeNull()
  })

  it('lead sin telefono no hay envio', () => {
    expect(aJobDeEnvio(fila, { telefono: null })).toBeNull()
  })

  it('telefono ilegible no hay envio', () => {
    expect(aJobDeEnvio(fila, { telefono: 'sin numero' })).toBeNull()
  })

  it('sin enviado_por queda una atribucion honesta, no un invento', () => {
    const job = aJobDeEnvio({ ...fila, enviado_por: null }, { telefono: '56911111111' })
    expect(job.enviado_por).toBe('CRM')
  })
})
