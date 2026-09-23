import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthSessionMissingError, createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

vi.mock('server-only', () => ({}))
const sesion = vi.hoisted(() => ({ cliente: vi.fn(), perfil: vi.fn(), revalidar: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: sesion.cliente }))
vi.mock('@/lib/repos/integrantes', () => ({
  IntegrantesRepository: class { getByAuthUser = sesion.perfil },
}))
vi.mock('next/cache', () => ({ revalidatePath: sesion.revalidar }))

import { leadsParaDemo, listarDemos } from './demos'
import { apagarDemo, crearDemo, sugerirGuionDemo } from '@/app/(app)/vex/intelligence/acciones-demos'

const AHORA = '2026-09-23T12:00:00Z'
const ID = '00000000-0000-4000-8000-000000000001'
const CREADOR = '00000000-0000-4000-8000-000000000002'
const fila = {
  id: ID, lead_id: null, telefono: '56987652232', nombre_negocio: 'Ópticas Kairos',
  guion: 'Asista a los clientes del negocio y ofrezca confirmar sus consultas con el equipo.',
  activa: true, vence_at: '2026-09-24T12:00:00Z', limite_mensajes: 40, mensajes_usados: 2, creado_por: CREADOR,
}

function clienteCon(responder: (url: URL, init?: RequestInit) => Response) {
  return createClient<Database>('https://example.test', 'clave-de-prueba', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => responder(new URL(String(url)), init) },
  })
}

function json(valor: unknown, status = 200) {
  return new Response(JSON.stringify(valor), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('listarDemos', () => {
  it.each([
    ['normal', {}, true],
    ['vencida', { vence_at: '2026-09-22T12:00:00Z' }, false],
    ['vence justo ahora', { vence_at: AHORA }, false],
    ['agotada', { mensajes_usados: 40 }, false],
    ['excedida', { mensajes_usados: 41 }, false],
    ['apagada', { activa: false }, false],
  ])('vigente en caso %s', async (_caso, cambios, esperado) => {
    const sb = clienteCon(() => json([{ ...fila, ...cambios }]))
    const [demo] = await listarDemos(sb)
    expect(demo.vigente).toBe(esperado)
    expect(demo.nombreNegocio).toBe(fila.nombre_negocio)
    expect(demo.creadoPor).toBe(CREADOR)
    expect(demo.leadId).toBeNull()
  })

  it('coloca las vigentes antes del historial sin duplicarlas', async () => {
    const sb = clienteCon(() => json([
      { ...fila, id: 'apagada', activa: false },
      { ...fila, id: 'vigente' },
      { ...fila, id: 'agotada', mensajes_usados: 40 },
    ]))
    expect((await listarDemos(sb)).map(d => d.id)).toEqual(['vigente', 'apagada', 'agotada'])
  })

  it('busca más allá de cien agotadas y devuelve como máximo cien demos', async () => {
    const pedidos: URL[] = []
    const agotadas = Array.from({ length: 100 }, (_, i) => ({ ...fila, id: `agotada-${i}`, mensajes_usados: 40 }))
    const sb = clienteCon(url => {
      pedidos.push(url)
      if (url.searchParams.get('offset') === '100') return json([fila])
      return json(agotadas)
    })
    const demos = await listarDemos(sb)
    expect(demos).toHaveLength(100)
    expect(demos[0].id).toBe(ID)
    expect(demos[0].vigente).toBe(true)
    expect(pedidos).toHaveLength(3)
  })

  it('informa los errores de lectura en vez de presentar un estado vacío', async () => {
    const sb = clienteCon(() => json({ message: 'Sin acceso', code: '42501' }, 403))
    await expect(listarDemos(sb)).rejects.toThrow('Sin acceso')
  })
})

describe('leadsParaDemo', () => {
  it('consulta solo leads no eliminados con teléfono, alfabéticos y con límite 600', async () => {
    const pedidos: URL[] = []
    const sb = clienteCon(url => {
      pedidos.push(url)
      return json([{ id: ID, nombre_negocio: 'Kairos', telefono: '56987652232' }])
    })
    expect(await leadsParaDemo(sb)).toEqual([{ id: ID, nombre: 'Kairos', telefono: '56987652232' }])
    expect(pedidos[0].searchParams.get('eliminado_at')).toBe('is.null')
    expect(pedidos[0].searchParams.getAll('telefono')).toEqual(['not.is.null', 'neq.'])
    expect(pedidos[0].searchParams.get('order')).toBe('nombre_negocio.asc')
    expect(pedidos[0].searchParams.get('limit')).toBe('600')
  })
})

describe('acciones de demos', () => {
  const entrada = { nombreNegocio: 'Kairos', telefono: '+56 9 8765 2232', guion: fila.guion, horas: 24 as const, limiteMensajes: 40 }

  function autenticar(sb: ReturnType<typeof clienteCon>) {
    vi.spyOn(sb.auth, 'getUser').mockResolvedValue({
      data: { user: { id: ID, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: AHORA } },
      error: null,
    })
    sesion.cliente.mockResolvedValue(sb)
    sesion.perfil.mockResolvedValue({ id: CREADOR })
  }

  it('firma con la sesión, normaliza el teléfono y calcula la duración en el servidor', async () => {
    let cuerpo: unknown
    const sb = clienteCon((_url, init) => { cuerpo = JSON.parse(String(init?.body)); return json(null, 201) })
    autenticar(sb)
    expect(await crearDemo({ ...entrada, ...{ creadoPor: 'suplantado' } })).toEqual({ ok: true })
    expect(cuerpo).toMatchObject({ creado_por: CREADOR, telefono: '56987652232', vence_at: '2026-09-24T12:00:00.000Z', limite_mensajes: 40, activa: true })
    expect(sesion.revalidar).toHaveBeenCalledWith('/vex/intelligence')
  })

  it('traduce el choque de número activo', async () => {
    autenticar(clienteCon(() => json({ code: '23505', message: 'duplicate key' }, 409)))
    expect(await crearDemo(entrada)).toEqual({ ok: false, error: 'Ese número ya tiene una demo activa: apáguela antes de crear otra.' })
    expect(sesion.revalidar).not.toHaveBeenCalled()
  })

  it.each([
    { telefono: 'abc' }, { guion: 'corto' }, { guion: 'x'.repeat(8001) },
    { limiteMensajes: 0 }, { limiteMensajes: 501 }, { limiteMensajes: 1.5 },
    { nombreNegocio: ' ' }, { horas: 48 as 24 }, { leadId: 'inválido' },
  ])('rechaza una entrada inválida antes de consultar la base', async cambio => {
    expect((await crearDemo({ ...entrada, ...cambio })).ok).toBe(false)
    expect(sesion.cliente).not.toHaveBeenCalled()
  })

  it('rechaza al usuario sin sesión', async () => {
    const sb = clienteCon(() => { throw new Error('No debería consultar tablas') })
    vi.spyOn(sb.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() })
    sesion.cliente.mockResolvedValue(sb)
    expect(await crearDemo(entrada)).toEqual({ ok: false, error: 'Hay que iniciar sesión para administrar demos.' })
  })

  it('rechaza al usuario que no es integrante', async () => {
    autenticar(clienteCon(() => { throw new Error('No debería consultar tablas') }))
    sesion.perfil.mockResolvedValue(null)
    expect((await apagarDemo(ID)).ok).toBe(false)
  })

  it('sugiere el guion desde la ficha existente y revalida', async () => {
    autenticar(clienteCon(() => json({
      nombre_negocio: 'Kairos', categoria_google: null, nicho: 'óptica', localidad: 'Santiago',
      horario: null, url_web: null, instagram: null, web_capacidades: null, telefono: '987652232',
    })))
    const r = await sugerirGuionDemo(ID)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.guion).toContain('Kairos')
      expect(r.guion.length).toBeGreaterThanOrEqual(50)
      expect(r.telefono).toBe('56987652232')
    }
    expect(sesion.revalidar).toHaveBeenCalledWith('/vex/intelligence')
  })

  it('apaga mediante PATCH sin borrar el historial', async () => {
    let metodo: string | undefined
    let cuerpo: unknown
    autenticar(clienteCon((_url, init) => {
      metodo = init?.method
      cuerpo = JSON.parse(String(init?.body))
      return json({ id: ID })
    }))
    expect(await apagarDemo(ID)).toEqual({ ok: true })
    expect(metodo).toBe('PATCH')
    expect(cuerpo).toEqual({ activa: false })
    expect(sesion.revalidar).toHaveBeenCalledWith('/vex/intelligence')
  })

  it('no dice que apagó una demo ausente', async () => {
    autenticar(clienteCon(() => json(null)))
    expect(await apagarDemo(ID)).toEqual({ ok: false, error: 'La demo no está disponible.' })
  })
})
