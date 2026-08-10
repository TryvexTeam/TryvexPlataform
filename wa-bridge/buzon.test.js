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
    })
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
