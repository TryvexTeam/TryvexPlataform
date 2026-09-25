import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El 409 de /api/jornadas tiene que traer el estado REAL: con eso el reloj se
 * pone al día en vez de quedarse mostrando un botón que ya no corresponde.
 */

const abierta = { id: 'j1', entrada_at: '2026-09-25T18:25:23Z', salida_at: null, pausas: [] }
let estadoReal: typeof abierta | null = abierta

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/repos/integrantes', () => ({
  IntegrantesRepository: class {
    getByAuthUser = async () => ({ id: 'i1' })
  },
}))
vi.mock('@/lib/repos/jornadas', () => ({
  JornadasRepository: class {
    getAbierta = async () => estadoReal
    marcarEntrada = async () => {
      if (estadoReal) throw new Error('jornada_ya_abierta')
      return abierta
    }
    marcarSalida = async () => {
      if (!estadoReal) throw new Error('sin_jornada_abierta')
      return { ...abierta, salida_at: 'ahora' }
    }
    pausar = async () => abierta
    reanudar = async () => abierta
  },
}))

const { POST } = await import('@/app/api/jornadas/route')

function marcar(accion: string) {
  return POST(new Request('http://x/api/jornadas', { method: 'POST', body: JSON.stringify({ accion }) }))
}

describe('POST /api/jornadas cuando la pantalla está desfasada', () => {
  beforeEach(() => {
    estadoReal = abierta
  })

  it('entrada con la jornada ya abierta: 409 con la jornada real', async () => {
    const res = await marcar('entrada')
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json).toMatchObject({ success: false, codigo: 'jornada_ya_abierta', data: { id: 'j1' } })
  })

  it('salida con la jornada ya cerrada sola: 409 con data null', async () => {
    estadoReal = null
    const res = await marcar('salida')
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json).toMatchObject({ codigo: 'sin_jornada_abierta', data: null })
  })

  it('lo que sí calza sigue respondiendo 200', async () => {
    estadoReal = null
    const res = await marcar('entrada')
    expect(res.status).toBe(200)
  })
})
