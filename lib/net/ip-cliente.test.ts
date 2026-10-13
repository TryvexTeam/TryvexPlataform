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

  it('descarta valores que no son IP', () => {
    expect(ipCliente(new Headers({ 'x-real-ip': 'no-es-ip' }))).toBeNull()
    expect(ipCliente(new Headers({ 'x-forwarded-for': '999.1.1.1' }))).toBeNull()
    expect(ipCliente(new Headers({ 'x-real-ip': "1.2.3.4'; drop" }))).toBeNull()
  })

  it('normaliza IPv4 mapeada en IPv6', () => {
    expect(ipCliente(new Headers({ 'x-real-ip': '::ffff:1.2.3.4' }))).toBe('1.2.3.4')
  })

  it('descarta el puerto', () => {
    expect(ipCliente(new Headers({ 'x-real-ip': '1.2.3.4:5678' }))).toBe('1.2.3.4')
    expect(ipCliente(new Headers({ 'x-real-ip': '[2001:db8::1]:443' }))).toBe('2001:db8::1')
  })

  it('acepta IPv6 válida', () => {
    expect(ipCliente(new Headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1')
  })
})
