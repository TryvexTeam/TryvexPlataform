import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  agenteConfigurado,
  obtenerAjustes,
  guardarAjuste,
  obtenerConversaciones,
  cambiarModo,
  obtenerAnalytics,
  ErrorAgente,
} from './agente'

const AGENTE = 'https://agente.test'
const TOKEN = 'txa_token_de_prueba'

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function simular(res: Response) {
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

describe('agenteConfigurado', () => {
  it('exige URL y token', () => {
    expect(agenteConfigurado()).toBe(true)

    delete process.env.VEX_AGENT_TOKEN
    expect(agenteConfigurado()).toBe(false)
  })
})

describe('obtenerAjustes', () => {
  it('devuelve los ajustes y los valores por defecto', async () => {
    const settings = { model: 'anthropic/claude-haiku-4.5', paused: '0' }
    simular(responder(200, { settings, defaults: settings }))

    const r = await obtenerAjustes()
    expect(r.settings.model).toBe('anthropic/claude-haiku-4.5')
  })

  it('manda el token por cabecera y nunca en la URL', async () => {
    const spy = simular(responder(200, { settings: {}, defaults: {} }))
    await obtenerAjustes()

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${AGENTE}/api/settings`)
    expect(url).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('quita las barras finales de la URL configurada', async () => {
    process.env.VEX_AGENT_URL = `${AGENTE}//`
    const spy = simular(responder(200, { settings: {}, defaults: {} }))
    await obtenerAjustes()

    expect(spy.mock.calls[0][0]).toBe(`${AGENTE}/api/settings`)
  })
})

describe('guardarAjuste', () => {
  it('envía la clave y el valor como JSON', async () => {
    const spy = simular(responder(200, { ok: true, settings: { buffer_seconds: '15' } }))

    await guardarAjuste('buffer_seconds', '15')

    const init = spy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ key: 'buffer_seconds', value: '15' })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})

describe('cambiarModo', () => {
  it('llama a la ruta de esa conversación', async () => {
    const spy = simular(responder(200, { ok: true }))

    await cambiarModo(42, 'HUMAN')

    expect(spy.mock.calls[0][0]).toBe(`${AGENTE}/api/mode/42`)
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      mode: 'HUMAN',
    })
  })
})

describe('obtenerConversaciones', () => {
  it('desenvuelve la lista', async () => {
    simular(responder(200, { conversations: [{ id: 1, phone: '569', mode: 'AI' }] }))

    const cs = await obtenerConversaciones()
    expect(cs).toHaveLength(1)
    expect(cs[0].mode).toBe('AI')
  })
})

describe('obtenerAnalytics', () => {
  it('pasa el rango de días', async () => {
    const spy = simular(responder(200, { rangeDays: 30 }))

    await obtenerAnalytics(30)
    expect(spy.mock.calls[0][0]).toBe(`${AGENTE}/api/analytics?days=30`)
  })
})

describe('errores', () => {
  it('explica el 401 sin filtrar el token', async () => {
    simular(responder(401, { ok: false }))

    const error = await obtenerAjustes().catch((e) => e)
    expect(error).toBeInstanceOf(ErrorAgente)
    expect(error.status).toBe(401)
    expect(error.message).toContain('VEX_AGENT_TOKEN')
    expect(error.message).not.toContain(TOKEN)
  })

  it('explica el 503 como agente sin credenciales', async () => {
    simular(responder(503, { ok: false }))

    const error = await obtenerAjustes().catch((e) => e)
    expect(error.message).toContain('credenciales')
  })

  it('acota el cuerpo del error para no volcar una página entera', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(5000), { status: 500 }))

    const error = await obtenerAjustes().catch((e) => e)
    expect(error.message.length).toBeLessThanOrEqual(200)
  })

  it('reporta 504 cuando el agente no contesta', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = await obtenerAjustes().catch((e) => e)
    expect(error.status).toBe(504)
  })

  it('falla con 503 si no está configurado, sin llamar a nadie', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    delete process.env.VEX_AGENT_URL

    const error = await obtenerAjustes().catch((e) => e)
    expect(error.status).toBe(503)
    expect(spy).not.toHaveBeenCalled()
  })
})
