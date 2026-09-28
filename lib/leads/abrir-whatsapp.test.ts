import { describe, expect, it } from 'vitest'
import { enlaceWhatsapp, esTelefono } from './abrir-whatsapp'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
}

describe('esTelefono', () => {
  it('iPhone y Android → app', () => {
    expect(esTelefono({ userAgent: UA.iphone })).toBe(true)
    expect(esTelefono({ userAgent: UA.android })).toBe(true)
  })
  it('Windows y Mac → WhatsApp Web', () => {
    expect(esTelefono({ userAgent: UA.windows })).toBe(false)
    expect(esTelefono({ userAgent: UA.mac, maxTouchPoints: 0 })).toBe(false)
  })
  it('un iPad que se presenta como Mac se reconoce por el táctil', () => {
    expect(esTelefono({ userAgent: UA.mac, maxTouchPoints: 5 })).toBe(true)
  })
  it('si el navegador lo declara, se le cree', () => {
    expect(esTelefono({ userAgent: UA.windows, mobile: true })).toBe(true)
  })
})

describe('enlaceWhatsapp', () => {
  const texto = 'Hola 👋 ¿hablo con La Mesa?\n\nSomos Tryvex & co.'
  it('teléfono → wa.me con el texto codificado', () => {
    const url = new URL(enlaceWhatsapp('56987652232', texto, true))
    expect(url.host).toBe('wa.me')
    expect(url.pathname).toBe('/56987652232')
    expect(url.searchParams.get('text')).toBe(texto)
  })
  it('computador → web.whatsapp.com/send, directo al chat', () => {
    const url = new URL(enlaceWhatsapp('56987652232', texto, false))
    expect(url.host).toBe('web.whatsapp.com')
    expect(url.searchParams.get('phone')).toBe('56987652232')
    expect(url.searchParams.get('text')).toBe(texto)
  })
})
