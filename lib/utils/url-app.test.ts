import { afterEach, describe, expect, it } from 'vitest'
import { urlApp } from './url-app'

const original = process.env.NEXT_PUBLIC_APP_URL
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = original
})

describe('urlApp', () => {
  it('se queda con el dominio aunque la variable traiga /login (el bug de producción)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://tryvexplataform.vercel.app/login'
    expect(urlApp()).toBe('https://tryvexplataform.vercel.app')
    expect(`${urlApp()}/auth/confirmar`).toBe('https://tryvexplataform.vercel.app/auth/confirmar')
  })

  it('quita la barra final', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crm.ejemplo.cl/'
    expect(urlApp()).toBe('https://crm.ejemplo.cl')
  })

  it('sin variable usa el origen del request', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(urlApp('https://x.vercel.app/api/auth/recuperar')).toBe('https://x.vercel.app')
  })

  it('mal escrita (sin https) cae al respaldo', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'tryvexplataform.vercel.app'
    expect(urlApp('https://x.vercel.app')).toBe('https://x.vercel.app')
  })

  it('sin variable ni respaldo, falla en vez de inventar un dominio', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(() => urlApp()).toThrow()
  })
})
