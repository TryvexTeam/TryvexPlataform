import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transporteActivo, enviarPorVex, explicarTransporteSinConfigurar } from './transporte'

const AGENTE = 'https://agente.test'
const TOKEN = 'txa_token'

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  process.env.VEX_AGENT_URL = AGENTE
  process.env.VEX_AGENT_TOKEN = TOKEN
  delete process.env.WA_TRANSPORTE
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.VEX_AGENT_URL
  delete process.env.VEX_AGENT_TOKEN
  delete process.env.WA_TRANSPORTE
})

describe('transporteActivo', () => {
  /**
   * Antes, sin la variable esto devolvía 'puente'. Tenía sentido mientras el
   * puente corría: desplegar no cambiaba producción por sí solo. Pero el puente
   * murió, y el default pasó a mandar mensajes a un proceso inexistente.
   *
   * Costó cuatro mensajes en 'encolado' durante dos días, sin un solo error que
   * mirar, porque nadie falló — nadie fue a buscarlos.
   */
  it('sin la variable NO elige: avisa', () => {
    expect(transporteActivo()).toBe('sin_configurar')
  })

  it('usa vex solo con el valor exacto', () => {
    process.env.WA_TRANSPORTE = 'vex'
    expect(transporteActivo()).toBe('vex')
  })

  it('el puente sigue disponible, pero hay que pedirlo', () => {
    // No desaparece: el corte entre transportes debe ser deliberado, y volver
    // atrás tiene que ser posible sin tocar código.
    process.env.WA_TRANSPORTE = 'puente'
    expect(transporteActivo()).toBe('puente')
  })

  it('tolera mayúsculas y espacios, que es como se escriben las variables a mano', () => {
    for (const v of [' VEX ', 'Vex', '  vex']) {
      process.env.WA_TRANSPORTE = v
      expect(transporteActivo()).toBe('vex')
    }
  })

  it('un valor que no existe tampoco elige por su cuenta', () => {
    for (const v of ['agente', 'si', '1', '']) {
      process.env.WA_TRANSPORTE = v
      expect(transporteActivo()).toBe('sin_configurar')
    }
  })
})

describe('explicarTransporteSinConfigurar', () => {
  it('cuando falta, nombra la variable y qué poner', () => {
    const m = explicarTransporteSinConfigurar()
    expect(m).toContain('WA_TRANSPORTE')
    expect(m).toContain('vex')
  })

  it('cuando el valor es inválido, lo cita para que se vea el error de tipeo', () => {
    process.env.WA_TRANSPORTE = 'vexx'
    expect(explicarTransporteSinConfigurar()).toContain('"vexx"')
  })
})

describe('enviarPorVex', () => {
  it('manda teléfono, texto y nombre con el token por cabecera', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(responder(202, { ok: true, outboxId: 7 }))

    const r = await enviarPorVex('56950358818', 'Hola', 'Barbería Central')

    expect(r).toEqual({ ok: true, referencia: 7 })

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${AGENTE}/api/enviar`)
    expect(url).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body as string)).toEqual({
      telefono: '56950358818',
      texto: 'Hola',
      nombre: 'Barbería Central',
    })
  })

  it('propaga el motivo cuando el agente rechaza — la sesión caída se explica', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder(503, { ok: false, error: 'La sesión de WhatsApp no está lista (disconnected)' })
    )

    const r = await enviarPorVex('56950358818', 'Hola')

    expect(r.ok).toBe(false)
    expect(r.error).toContain('no está lista')
  })

  it('propaga el rechazo por baneo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder(409, { ok: false, error: 'WhatsApp rechazó este número: no se envía nada' })
    )

    const r = await enviarPorVex('56950358818', 'Hola')

    expect(r.ok).toBe(false)
    expect(r.error).toContain('rechazó')
  })

  it('no da por bueno un 200 sin ok:true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responder(200, { encolado: false }))

    expect((await enviarPorVex('569', 'Hola')).ok).toBe(false)
  })

  it('devuelve error, no lanza, si el agente no responde', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await enviarPorVex('56950358818', 'Hola')

    expect(r.ok).toBe(false)
    expect(r.error).toBe('El agente no responde')
  })

  it('no llama a nadie si el agente no está configurado', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    delete process.env.VEX_AGENT_URL

    const r = await enviarPorVex('56950358818', 'Hola')

    expect(r.ok).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})
