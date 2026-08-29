import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { obtenerEstadoQr } from './qr'

/**
 * El agente (`Vex-Agente`) sirve el estado como JSON, no como HTML: antes esto
 * raspaba el markup del `wa-bridge` con una expresión regular, y cualquier
 * cambio de maqueta dejaba al equipo sin poder escanear.
 *
 * Las respuestas de acá replican las de `src/app/api/connection/status/route.ts`
 * del agente. Si ese contrato cambia, estos tests fallan y lo vemos antes que el
 * equipo se quede mirando una pantalla vacía.
 */

const AGENTE = 'https://agente.test'
const TOKEN = 'txa_token_de_prueba'
const QR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Deja `fetch` devolviendo esa respuesta y expone la llamada para inspeccionarla. */
function simularAgente(res: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(res)
}

beforeEach(() => {
  process.env.VEX_AGENT_URL = AGENTE
  process.env.VEX_AGENT_TOKEN = TOKEN
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.VEX_AGENT_URL
  delete process.env.VEX_AGENT_TOKEN
})

describe('obtenerEstadoQr', () => {
  it('devuelve el QR cuando el agente lo tiene listo', async () => {
    simularAgente(responder(200, { status: 'qr', qrPng: QR_PNG, phone: null }))

    expect(await obtenerEstadoQr()).toEqual({ estado: 'qr_listo', imagen: QR_PNG })
  })

  it('informa el número cuando la sesión ya está conectada', async () => {
    simularAgente(responder(200, { status: 'connected', phone: '56950358818' }))

    expect(await obtenerEstadoQr()).toEqual({
      estado: 'conectado',
      telefono: '56950358818',
    })
  })

  it('propaga el posible baneo — es el estado que no se puede perder', async () => {
    simularAgente(responder(200, { status: 'posible_baneo', phone: '56950358818' }))

    expect(await obtenerEstadoQr()).toEqual({
      estado: 'posible_baneo',
      telefono: '56950358818',
    })
  })

  it('trata connecting y disconnected como espera', async () => {
    simularAgente(responder(200, { status: 'connecting', phone: null }))
    expect((await obtenerEstadoQr()).estado).toBe('esperando_qr')

    vi.restoreAllMocks()
    simularAgente(responder(200, { status: 'disconnected', phone: null }))
    expect((await obtenerEstadoQr()).estado).toBe('esperando_qr')
  })

  it('degrada a espera un qr sin imagen, en vez de anunciar un QR que no existe', async () => {
    simularAgente(responder(200, { status: 'qr', phone: null }))

    const r = await obtenerEstadoQr()
    expect(r.estado).toBe('esperando_qr')
    expect(r.imagen).toBeUndefined()
  })

  it('trata un estado desconocido como espera, sin romper', async () => {
    simularAgente(responder(200, { status: 'algo_que_no_existe_todavia' }))

    expect((await obtenerEstadoQr()).estado).toBe('esperando_qr')
  })

  it('manda el token por cabecera, nunca en la URL', async () => {
    const spy = simularAgente(responder(200, { status: 'qr', qrPng: QR_PNG }))
    await obtenerEstadoQr()

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${AGENTE}/api/connection/status`)
    expect(url).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('quita la barra final de la URL configurada', async () => {
    process.env.VEX_AGENT_URL = `${AGENTE}///`
    const spy = simularAgente(responder(200, { status: 'qr', qrPng: QR_PNG }))
    await obtenerEstadoQr()

    expect(spy.mock.calls[0][0]).toBe(`${AGENTE}/api/connection/status`)
  })

  it('reporta token inválido con 401 y con 403', async () => {
    simularAgente(responder(401, { ok: false }))
    expect((await obtenerEstadoQr()).estado).toBe('token_invalido')

    vi.restoreAllMocks()
    simularAgente(responder(403, { ok: false }))
    expect((await obtenerEstadoQr()).estado).toBe('token_invalido')
  })

  it('reporta token inválido si el agente corre sin credenciales y se cerró solo', async () => {
    simularAgente(responder(503, { ok: false, error: 'Panel sin credenciales configuradas.' }))

    expect((await obtenerEstadoQr()).estado).toBe('token_invalido')
  })

  it('reporta sin respuesta ante un error del agente', async () => {
    simularAgente(responder(500, { ok: false }))

    expect((await obtenerEstadoQr()).estado).toBe('sin_respuesta')
  })

  it('reporta sin respuesta cuando el agente no contesta', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await obtenerEstadoQr()).estado).toBe('sin_respuesta')
  })

  it('no llama a nadie si falta configuración', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')

    delete process.env.VEX_AGENT_URL
    expect((await obtenerEstadoQr()).estado).toBe('no_configurado')

    process.env.VEX_AGENT_URL = AGENTE
    delete process.env.VEX_AGENT_TOKEN
    expect((await obtenerEstadoQr()).estado).toBe('no_configurado')

    expect(spy).not.toHaveBeenCalled()
  })
})

/**
 * El estado que faltaba, y que costó dos días de ceguera.
 *
 * El agente puede afirmar estar conectado con una marca de tiempo de hace
 * horas. Pasó el 28-ago: el socket de WhatsApp murió, el proceso siguió vivo,
 * y como nadie escribía un evento nuevo el último 'connected' se leyó como
 * verdad presente. El agente ahora responde `sin_latido`; acá se comprueba que
 * el CRM lo entienda y NO lo confunda con "hay que escanear de nuevo".
 */
describe('sin_latido', () => {
  it('lo reconoce como estado propio, no como espera de QR', async () => {
    simularAgente(responder(200, { status: 'sin_latido', phone: '56950358818', sinLatidoHace: 12001 }))

    const r = await obtenerEstadoQr()

    expect(r.estado).toBe('sin_latido')
    expect(r.telefono).toBe('56950358818')
  })

  it('trae el tiempo sin señal, que es lo que distingue un parpadeo de una caída', async () => {
    simularAgente(responder(200, { status: 'sin_latido', phone: '56950358818', sinLatidoHace: 12001 }))

    const r = await obtenerEstadoQr()

    expect(r.sinLatidoHace).toBe(12001)
  })

  it('NO muestra un QR: la vinculación está bien, lo que se cayó es la salida', async () => {
    // Esta es la razón de que el estado exista. Cayendo en el caso por defecto
    // se anunciaba un QR, y el equipo terminaba desvinculando un número sano.
    simularAgente(responder(200, { status: 'sin_latido', phone: '56950358818', sinLatidoHace: 300 }))

    const r = await obtenerEstadoQr()

    expect(r.estado).not.toBe('qr_listo')
    expect(r.estado).not.toBe('esperando_qr')
    expect(r.imagen).toBeUndefined()
  })

  it('sigue distinguiéndose de sin_respuesta, que es no contestar', async () => {
    simularAgente(responder(500, {}))
    expect((await obtenerEstadoQr()).estado).toBe('sin_respuesta')
  })
})

