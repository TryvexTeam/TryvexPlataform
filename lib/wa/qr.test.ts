import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { obtenerEstadoQr } from './qr'

/**
 * El wa-bridge sirve el QR como HTML (está pensado para abrirse directo en el
 * navegador), así que este parseo es el punto frágil de la vista: si el markup
 * del bridge cambia, la vinculación deja de mostrar el código.
 *
 * Los HTML de acá están copiados textualmente de `wa-bridge/index.js` para que,
 * si Spike cambia ese endpoint, este test falle y lo veamos antes que el equipo
 * quede sin poder escanear.
 */

const BRIDGE = 'http://bridge.test:4600'

function htmlConQr(dataUrl: string): string {
  return `<html><head><meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif;text-align:center;margin-top:2em">
      <h2>Escanea con WhatsApp -> Dispositivos vinculados</h2>
      <img src="${dataUrl}" alt="QR de WhatsApp" />
      <p>Esta pagina se refresca sola cada 20s (el QR expira y se regenera solo).</p>
    </body></html>`
}

const HTML_CONECTADA =
  '<html><body style="font-family:sans-serif;text-align:center;margin-top:4em"><h2>Sesion ya conectada</h2><p>No hace falta escanear nada.</p></body></html>'

function responder(status: number, body: string): Response {
  return new Response(body, { status })
}

beforeEach(() => {
  process.env.WA_BRIDGE_URL = BRIDGE
  process.env.WA_BRIDGE_QR_TOKEN = 'token-de-prueba'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.WA_BRIDGE_URL
  delete process.env.WA_BRIDGE_QR_TOKEN
})

describe('obtenerEstadoQr', () => {
  it('devuelve no_configurado cuando falta la URL del puente', async () => {
    delete process.env.WA_BRIDGE_URL

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'no_configurado' })
  })

  it('devuelve no_configurado cuando falta el token del QR', async () => {
    delete process.env.WA_BRIDGE_QR_TOKEN

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'no_configurado' })
  })

  it('extrae la imagen del QR del HTML que sirve el puente', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responder(200, htmlConQr(dataUrl)))

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'qr_listo', imagen: dataUrl })
  })

  it('manda el token por query param y no lo expone en el resultado', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(responder(200, htmlConQr('data:image/png;base64,AAAA')))

    const resultado = await obtenerEstadoQr()

    const urlLlamada = String(spy.mock.calls[0][0])
    expect(urlLlamada).toBe(`${BRIDGE}/qr?token=token-de-prueba`)
    expect(JSON.stringify(resultado)).not.toContain('token-de-prueba')
  })

  it('reconoce la sesión ya vinculada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responder(200, HTML_CONECTADA))

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'conectado' })
  })

  it('reporta esperando_qr cuando el puente todavía no emitió el código (503)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder(503, '<html><body><h2>Todavia no hay QR</h2></body></html>')
    )

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'esperando_qr' })
  })

  it('reporta token_invalido cuando el puente rechaza la credencial (401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responder(401, 'token invalido'))

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'token_invalido' })
  })

  it('reporta esperando_qr, sin romper, si el HTML del puente cambia', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder(200, '<html><body>markup nuevo, sin imagen</body></html>')
    )

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'esperando_qr' })
  })

  it('reporta sin_respuesta cuando el puente está caído', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const resultado = await obtenerEstadoQr()

    expect(resultado).toEqual({ estado: 'sin_respuesta' })
  })
})
