import { describe, it, expect } from 'vitest'
import { leerAcuse, llego, sinConfirmar } from './acuse'

/**
 * El caso real que hizo falta esto: durante dos días WhatsApp devolvió el acuse
 * con `error: 463` —recibe el mensaje y lo descarta— y el CRM mostró todo como
 * enviado, moviendo fichas a «contactado». El acuse crudo, capturado en el VPS:
 *
 *   {"from":"56973593282@s.whatsapp.net","class":"message","error":"463"}
 */

describe('leerAcuse', () => {
  it('el 463 es un fallo, y se explica en castellano', () => {
    const r = leerAcuse({ error: '463' })

    expect(r.estado).toBe('fallido')
    expect(r.codigo).toBe('463')
    expect(r.motivo).toBe('WhatsApp recibió el mensaje y lo descartó sin entregarlo')
  })

  it('sin error, el acuse confirma la entrega', () => {
    expect(leerAcuse({})).toEqual({ estado: 'entregado', codigo: null, motivo: null })
  })

  it('un acuse con código 0 también es bueno', () => {
    expect(leerAcuse({ error: '0' }).estado).toBe('entregado')
  })

  it('distingue leído de solo entregado', () => {
    expect(leerAcuse({ leido: true }).estado).toBe('leido')
    expect(leerAcuse({ leido: false }).estado).toBe('entregado')
  })

  it('un error desconocido es fallido, no entregado', () => {
    // El costo de los dos errores no es el mismo: dar por entregado lo que se
    // perdió es lo que hace que nadie vuelva a escribirle a ese lead.
    const r = leerAcuse({ error: '999' })

    expect(r.estado).toBe('fallido')
    expect(r.motivo).toContain('999')
  })

  it('acepta el código como número, que es como lo manda el transporte', () => {
    expect(leerAcuse({ error: 463 })).toMatchObject({ estado: 'fallido', codigo: '463' })
  })

  it('un error vacío no se confunde con un error', () => {
    expect(leerAcuse({ error: '' }).estado).toBe('entregado')
    expect(leerAcuse({ error: null }).estado).toBe('entregado')
  })

  it('traduce los otros códigos que ya nos cruzamos', () => {
    expect(leerAcuse({ error: '404' }).motivo).toBe('Ese número no existe en WhatsApp')
    expect(leerAcuse({ error: '429' }).motivo).toContain('limitando el ritmo')
  })
})

describe('llego', () => {
  it('solo entregado y leído cuentan como llegado', () => {
    expect(llego('entregado')).toBe(true)
    expect(llego('leido')).toBe(true)
    expect(llego('pendiente')).toBe(false)
    expect(llego('enviado')).toBe(false)
    expect(llego('fallido')).toBe(false)
    expect(llego(null)).toBe(false)
  })

  it('«enviado» NO significa que llegó — es el bug que originó todo esto', () => {
    expect(llego('enviado')).toBe(false)
  })
})

describe('sinConfirmar', () => {
  it('la espera no es un fallo', () => {
    // Presentar «todavía no sabemos» como un fallo hace que alguien reenvíe un
    // mensaje que sí iba a llegar.
    expect(sinConfirmar('pendiente')).toBe(true)
    expect(sinConfirmar(null)).toBe(true)
    expect(sinConfirmar('fallido')).toBe(false)
    expect(sinConfirmar('entregado')).toBe(false)
  })
})
