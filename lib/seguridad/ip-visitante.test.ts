import { describe, it, expect } from 'vitest'
import { ipDelVisitante, pareceIP } from '@/app/api/publico/citas/route'

/**
 * El rate limit de reservas tiene que contar PERSONAS, no servidores.
 *
 * Esta ruta no la llama el visitante: la llama el servidor de la landing con su
 * token. Hasta el 13-sep-2026 se contaba la IP de quien hacia la peticion, o
 * sea siempre la misma —la de Vercel—, y el limite de 3 reservas por hora se
 * repartia entre todos los visitantes juntos. Con trafico real, el cuarto que
 * agendara en una hora quedaba bloqueado sin haber hecho nada.
 */

function pedido(cabeceras: Record<string, string>): Request {
  return new Request('https://crm.test/api/publico/citas', { method: 'POST', headers: cabeceras })
}

describe('a quien se le cuenta la reserva', () => {
  it('usa la IP del visitante cuando la landing la declara', () => {
    const req = pedido({ 'x-visitante-ip': '200.1.2.3', 'x-real-ip': '34.228.59.164' })
    expect(ipDelVisitante(req)).toBe('200.1.2.3')
  })

  it('dos visitantes distintos NO comparten el cupo', () => {
    // El caso que rompia: los dos llegan por el mismo servidor de la landing.
    const uno = ipDelVisitante(pedido({ 'x-visitante-ip': '200.1.2.3', 'x-real-ip': '34.228.59.164' }))
    const otro = ipDelVisitante(pedido({ 'x-visitante-ip': '190.9.9.9', 'x-real-ip': '34.228.59.164' }))
    expect(uno).not.toBe(otro)
  })

  it('sin la cabecera cae a la IP de la peticion, no a null', () => {
    // Degradar a "compartido" es aceptable; quedarse sin limite no lo es.
    const req = pedido({ 'x-real-ip': '34.228.59.164' })
    expect(ipDelVisitante(req)).toBe('34.228.59.164')
  })

  it('una cabecera con basura se ignora y cae a la IP real', () => {
    const req = pedido({ 'x-visitante-ip': 'no-soy-una-ip', 'x-real-ip': '34.228.59.164' })
    expect(ipDelVisitante(req)).toBe('34.228.59.164')
  })

  it('una cabecera larguisima no entra a la tabla', () => {
    const req = pedido({ 'x-visitante-ip': '9'.repeat(300), 'x-real-ip': '34.228.59.164' })
    expect(ipDelVisitante(req)).toBe('34.228.59.164')
  })

  it('sin nada de donde sacarla, devuelve null y la ruta corta', () => {
    expect(ipDelVisitante(pedido({}))).toBeNull()
  })
})

describe('pareceIP', () => {
  it('acepta IPv4 e IPv6', () => {
    expect(pareceIP('200.1.2.3')).toBe(true)
    expect(pareceIP('2001:db8::1')).toBe(true)
  })
  it('rechaza lo que no tiene forma de IP', () => {
    expect(pareceIP('')).toBe(false)
    expect(pareceIP('hola')).toBe(false)
    expect(pareceIP('drop table')).toBe(false)
  })
})
