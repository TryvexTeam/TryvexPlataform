import { describe, expect, it } from 'vitest'
import { ipCliente } from './ip-cliente'

describe('ipCliente', () => {
  it('prefiere x-real-ip', () => {
    expect(ipCliente(new Headers({ 'x-real-ip': ' 1.2.3.4 ', 'x-forwarded-for': '5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('usa la primera IP reenviada', () => {
    expect(ipCliente(new Headers({ 'x-forwarded-for': ' 5.6.7.8, 9.10.11.12 ' }))).toBe('5.6.7.8')
  })

  it('devuelve null para cabeceras vacías', () => {
    expect(ipCliente(new Headers({ 'x-real-ip': ' ', 'x-forwarded-for': ' ' }))).toBeNull()
  })
})
