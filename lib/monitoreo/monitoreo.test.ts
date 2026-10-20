import { describe, expect, it } from 'vitest'
import { aTexto, decimal, porcentajeDe, redondearTexto, sumar } from './decimal'
import { MetricasV1Schema, type MetricasV1 } from './esquema'
import { detectarAnomalias } from './anomalias'
import { calcularComision } from './comision'
import { MAX_BYTES, pedirMetricas, validarUrlPublica } from './cliente'

const SELLO_A = 'a'.repeat(64)
const SELLO_B = 'b'.repeat(64)

type Org = MetricasV1['organizations'][number]
type Montos = { reg: string; anu?: string; regCount?: number; anuCount?: number }

function mes(month: string, closed: boolean, monedas: Record<string, Montos>, seal: string | null = closed ? SELLO_A : null) {
  return {
    month,
    closed,
    seal,
    by_currency: Object.fromEntries(Object.entries(monedas).map(([m, v]) => [m, {
      registered: { count: v.regCount ?? 1, total: v.reg },
      annulled: { count: v.anuCount ?? 0, total: v.anu ?? '0.00' },
    }])),
  }
}

function base(over: Partial<MetricasV1> = {}): MetricasV1 {
  return {
    schema: 'tryvex.metrics/v1',
    project: 'bitacora-coach',
    generated_at: '2026-10-20T12:00:00Z',
    version: 'a16e751',
    schema_version: '20261020220000_ops-metricas',
    organizations: [{
      org_ref: '00000000000000a1',
      slug: 'johandri',
      reseller: null,
      students: { active: 10, blocked: 1 },
      subscriptions: { active: 10, expiring_7d: 2, grace: 1, expired: 0 },
      payments: [mes('2026-09', true, { CLP: { reg: '100000.00' } }), mes('2026-10', false, { CLP: { reg: '50000.00' } })],
    }],
    ...over,
  }
}

function conOrg(m: MetricasV1, cambios: Partial<Org>): MetricasV1 {
  return { ...m, organizations: [{ ...m.organizations[0], ...cambios }] }
}

/** Respuesta realista de Bitácora: 2 organizaciones, CLP + USD, mes en curso sin sello. */
const MUESTRA_CONTRATO = {
  schema: 'tryvex.metrics/v1',
  project: 'bitacora-coach',
  generated_at: '2026-10-20T23:10:00Z',
  version: '1a8c7b8',
  schema_version: '20261020220000_ops-metricas',
  organizations: [
    {
      org_ref: '4f1c9a2b7d3e8f60',
      slug: 'johandri-acosta',
      reseller: null,
      students: { active: 12, blocked: 1 },
      subscriptions: { active: 10, expiring_7d: 2, grace: 1, expired: 1 },
      payments: [
        {
          month: '2026-08', closed: true, seal: '3f'.repeat(32),
          by_currency: { CLP: { registered: { count: 7, total: '349930.00' }, annulled: { count: 0, total: '0.00' } } },
        },
        {
          month: '2026-09', closed: true, seal: 'f'.repeat(64),
          by_currency: {
            CLP: { registered: { count: 8, total: '399920.00' }, annulled: { count: 1, total: '49990.00' } },
            USD: { registered: { count: 2, total: '99.90' }, annulled: { count: 0, total: '0.00' } },
          },
        },
        {
          month: '2026-10', closed: false, seal: null,
          by_currency: { CLP: { registered: { count: 3, total: '149970.00' }, annulled: { count: 0, total: '0.00' } } },
        },
      ],
    },
    {
      org_ref: '9b0e5d7c1a2f3e48',
      slug: 'coach-demo',
      reseller: 'revendedor-sur',
      students: { active: 4, blocked: 0 },
      subscriptions: { active: 3, expiring_7d: 0, grace: 0, expired: 1 },
      payments: [
        {
          month: '2026-09', closed: true, seal: '0a'.repeat(32),
          by_currency: { USD: { registered: { count: 1, total: '0.10' }, annulled: { count: 0, total: '0.00' } } },
        },
        {
          month: '2026-10', closed: false, seal: null,
          by_currency: { USD: { registered: { count: 1, total: '0.20' }, annulled: { count: 0, total: '0.00' } } },
        },
      ],
    },
  ],
}

describe('contrato tryvex.metrics/v1 (muestra con la forma de Bitácora)', () => {
  it('la muestra pasa el esquema tal cual', () => {
    const r = MetricasV1Schema.safeParse(MUESTRA_CONTRATO)
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
  })

  it('la comisión suma organizaciones por mes y moneda', () => {
    const filas = calcularComision(MetricasV1Schema.parse(MUESTRA_CONTRATO), '10.00')
    expect(filas.map((f) => [f.mes, f.moneda, f.cerrado, f.registrado, f.anulado, f.comision])).toEqual([
      ['2026-10', 'CLP', false, '149970', '0', '14997'],
      ['2026-10', 'USD', false, '0.2', '0', '0.02'],
      ['2026-09', 'CLP', true, '399920', '49990', '39992'],
      ['2026-09', 'USD', true, '100', '0', '10'],
      ['2026-08', 'CLP', true, '349930', '0', '34993'],
    ])
  })

  it('la misma muestra dos veces no alerta (12,5 % anulado en septiembre no supera el umbral)', () => {
    const m = MetricasV1Schema.parse(MUESTRA_CONTRATO)
    expect(detectarAnomalias(m, m, { estadosRecientes: [200] })).toEqual([])
  })

  it('el formato anterior (filas planas month+currency y seals[]) se rechaza', () => {
    const viejo = {
      ...MUESTRA_CONTRATO,
      organizations: [{
        ...MUESTRA_CONTRATO.organizations[0],
        payments: [{ month: '2026-09', currency: 'CLP', registered: { count: 1, total: '1.00' }, annulled: { count: 0, total: '0.00' } }],
        seals: [{ month: '2026-09', sha256: SELLO_A }],
      }],
    }
    expect(MetricasV1Schema.safeParse(viejo).success).toBe(false)
  })
})

describe('decimal', () => {
  it('0.1 + 0.2 es exactamente 0.3', () => {
    expect(aTexto(sumar(decimal('0.1'), decimal('0.2')))).toBe('0.3')
  })
  it('porcentaje exacto sin coma flotante', () => {
    expect(aTexto(porcentajeDe(decimal('1000.10'), decimal('12.5')))).toBe('125.0125')
    expect(redondearTexto(porcentajeDe(decimal('0.3'), decimal('10')), 2)).toBe('0.03')
  })
  it('rechaza formatos inválidos', () => {
    for (const malo of ['-1', '1e5', '01', '1.', '1.12345', 'abc', '']) expect(() => decimal(malo)).toThrow()
  })
})

describe('calcularComision', () => {
  it('suma organizaciones con decimales exactos (0.10 + 0.20) y aplica el porcentaje', () => {
    const org = base().organizations[0]
    const m = base({
      organizations: [
        { ...org, org_ref: '000000000000000a', slug: 'a', payments: [mes('2026-09', true, { USD: { reg: '0.10' } })] },
        { ...org, org_ref: '000000000000000b', slug: 'b', payments: [mes('2026-09', true, { USD: { reg: '0.20', anu: '0.05', anuCount: 1 } })] },
      ],
    })
    const [fila] = calcularComision(m, 10)
    expect(fila).toEqual({
      mes: '2026-09', moneda: 'USD', cerrado: true, pagos: 2, anulaciones: 1,
      registrado: '0.3', anulado: '0.05', comision: '0.03',
    })
  })

  it('separa por moneda, ordena mes desc y respeta closed del payload', () => {
    const m = conOrg(base(), {
      payments: [
        mes('2026-09', true, { USD: { reg: '10.00' }, CLP: { reg: '100000.00' } }),
        mes('2026-10', false, { CLP: { reg: '50000.00' } }),
      ],
    })
    const filas = calcularComision(m, '12.50')
    expect(filas.map((f) => `${f.mes}|${f.moneda}|${f.cerrado}|${f.comision}`)).toEqual([
      '2026-10|CLP|false|6250',
      '2026-09|CLP|true|12500',
      '2026-09|USD|true|1.25',
    ])
  })
})

describe('MetricasV1Schema', () => {
  it('acepta un payload válido', () => {
    expect(MetricasV1Schema.safeParse(base()).success).toBe(true)
  })

  const montoNumerico = {
    ...mes('2026-09', true, {}),
    by_currency: { CLP: { registered: { count: 1, total: 1 as unknown as string }, annulled: { count: 0, total: '0.00' } } },
  }
  const trece = Array.from({ length: 13 }, (_, k) => mes(`20${25 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`, true, {}))

  it.each([
    ['total como número', (m: MetricasV1) => conOrg(m, { payments: [montoNumerico] })],
    ['total sin 2 decimales', (m: MetricasV1) => conOrg(m, { payments: [mes('2026-09', true, { CLP: { reg: '100' } })] })],
    ['total negativo', (m: MetricasV1) => conOrg(m, { payments: [mes('2026-09', true, { CLP: { reg: '-5.00' } })] })],
    ['campo desconocido', (m: MetricasV1) => ({ ...m, extra: true }) as MetricasV1],
    ['schema equivocado', (m: MetricasV1) => ({ ...m, schema: 'tryvex.metrics/v2' }) as unknown as MetricasV1],
    ['generated_at con milisegundos', (m: MetricasV1) => ({ ...m, generated_at: '2026-10-20T12:00:00.000Z' })],
    ['sello no hex', (m: MetricasV1) => conOrg(m, { payments: [mes('2026-09', true, { CLP: { reg: '1.00' } }, 'xyz')] })],
    ['mes inválido', (m: MetricasV1) => conOrg(m, { payments: [mes('2026-13', true, { CLP: { reg: '1.00' } })] })],
    ['moneda en minúscula', (m: MetricasV1) => conOrg(m, { payments: [mes('2026-09', true, { clp: { reg: '1.00' } })] })],
    ['mes duplicado', (m: MetricasV1) => conOrg(m, { payments: [mes('2026-09', true, {}), mes('2026-09', true, {})] })],
    ['más de 12 meses', (m: MetricasV1) => conOrg(m, { payments: trece })],
    ['students con otra forma', (m: MetricasV1) => conOrg(m, { students: { active: 1 } as unknown as Org['students'] })],
    ['slug con email', (m: MetricasV1) => conOrg(m, { slug: 'a@b.cl' })],
    ['sin org_ref', (m: MetricasV1) => conOrg(m, { org_ref: undefined as unknown as string })],
    ['org_ref con mayúsculas', (m: MetricasV1) => conOrg(m, { org_ref: '00000000000000A1' })],
    ['org_ref repetido', (m: MetricasV1) => ({ ...m, organizations: [m.organizations[0], { ...m.organizations[0], slug: 'otra' }] })],
  ])('rechaza %s', (_caso, romper) => {
    expect(MetricasV1Schema.safeParse(romper(base())).success).toBe(false)
  })
})

describe('detectarAnomalias', () => {
  it('sin cambios no alerta', () => {
    expect(detectarAnomalias(base(), base(), { estadosRecientes: [200, 200, 200] })).toEqual([])
  })

  it('SEAL_CHANGED cuando un mes cerrado cambia de sello', () => {
    const actual = conOrg(base(), {
      payments: [mes('2026-09', true, { CLP: { reg: '100000.00' } }, SELLO_B), mes('2026-10', false, { CLP: { reg: '50000.00' } })],
    })
    expect(detectarAnomalias(base(), actual)).toEqual([{
      tipo: 'SEAL_CHANGED', clave: '00000000000000a1|2026-09',
      detalle: { org_ref: '00000000000000a1', organizacion: 'johandri', mes: '2026-09', antes: SELLO_A, ahora: SELLO_B },
    }])
  })

  it('si el mes cerrado desaparece dentro de la ventana alerta; si salió de ella, no', () => {
    const sinSeptiembre = conOrg(base(), { payments: [mes('2026-10', false, { CLP: { reg: '50000.00' } })] })
    expect(detectarAnomalias(base(), sinSeptiembre).map((a) => a.tipo).sort()).toEqual(['REVENUE_DECREASED', 'SEAL_CHANGED'])
    const viejo = conOrg(base(), { payments: [mes('2025-09', true, { CLP: { reg: '1.00' } })] })
    expect(detectarAnomalias(viejo, sinSeptiembre)).toEqual([])
  })

  it('renombrar el slug (mismo org_ref) no alerta; las alertas muestran el slug nuevo', () => {
    const renombrada = conOrg(base(), { slug: 'johandri-coach' })
    expect(detectarAnomalias(base(), renombrada)).toEqual([])
    const conCambio = conOrg(renombrada, { payments: [mes('2026-09', true, { CLP: { reg: '1.00' } }, SELLO_B)] })
    const alertas = detectarAnomalias(base(), conCambio)
    expect(alertas.map((a) => [a.tipo, a.clave, a.detalle.organizacion])).toEqual([
      ['SEAL_CHANGED', '00000000000000a1|2026-09', 'johandri-coach'],
      ['REVENUE_DECREASED', '00000000000000a1|2026-09|CLP', 'johandri-coach'],
    ])
  })

  it('reusar un slug con otro org_ref no hereda la historia: la organización previa desaparece', () => {
    const otra = conOrg(base(), { org_ref: '00000000000000b2' })
    expect(detectarAnomalias(base(), otra).map((a) => [a.tipo, a.detalle.org_ref])).toEqual([
      ['SEAL_CHANGED', '00000000000000a1'],
      ['REVENUE_DECREASED', '00000000000000a1'],
    ])
  })

  it('el mes en curso (closed=false) puede cambiar sin alertar', () => {
    const actual = conOrg(base(), {
      payments: [mes('2026-09', true, { CLP: { reg: '100000.00' } }), mes('2026-10', false, { CLP: { reg: '1.00' } })],
    })
    expect(detectarAnomalias(base(), actual)).toEqual([])
  })

  it('REVENUE_DECREASED por org+mes+moneda cuando baja el registrado de un mes cerrado', () => {
    const actual = conOrg(base(), {
      payments: [mes('2026-09', true, { CLP: { reg: '99999.99' } }), mes('2026-10', false, { CLP: { reg: '50000.00' } })],
    })
    expect(detectarAnomalias(base(), actual)).toEqual([{
      tipo: 'REVENUE_DECREASED', clave: '00000000000000a1|2026-09|CLP',
      detalle: { org_ref: '00000000000000a1', organizacion: 'johandri', mes: '2026-09', moneda: 'CLP', antes: '100000.00', ahora: '99999.99' },
    }])
  })

  it('REVENUE_DECREASED cuando desaparece una moneda del mes cerrado', () => {
    const previo = conOrg(base(), { payments: [mes('2026-09', true, { CLP: { reg: '100.00' }, USD: { reg: '5.00' } })] })
    const actual = conOrg(base(), { payments: [mes('2026-09', true, { CLP: { reg: '100.00' } })] })
    expect(detectarAnomalias(previo, actual).map((a) => [a.clave, a.detalle.ahora])).toEqual([['00000000000000a1|2026-09|USD', '0']])
  })

  it('ANNULMENTS_SPIKE sobre 20 % (no en 20 % exacto)', () => {
    const conMes = (reg: string, anu: string) => conOrg(base(), { payments: [mes('2026-09', true, { CLP: { reg, anu } })] })
    expect(detectarAnomalias(null, conMes('100.00', '20.00'))).toEqual([])
    expect(detectarAnomalias(null, conMes('100.00', '20.01')).map((a) => [a.tipo, a.clave])).toEqual([['ANNULMENTS_SPIKE', '00000000000000a1|2026-09|CLP']])
    expect(detectarAnomalias(null, conMes('0.00', '5.00')).map((a) => a.tipo)).toEqual(['ANNULMENTS_SPIKE'])
  })

  it('SAAS_DOWN con 3 fallos seguidos; 429 se ignora; un 200 corta la racha', () => {
    expect(detectarAnomalias(null, null, { estadosRecientes: [503, 0, 404] }).map((a) => a.tipo)).toEqual(['SAAS_DOWN'])
    expect(detectarAnomalias(null, null, { estadosRecientes: [503, 0] })).toEqual([])
    expect(detectarAnomalias(null, null, { estadosRecientes: [503, 200, 503, 503] })).toEqual([])
    expect(detectarAnomalias(null, null, { estadosRecientes: [503, 429, 429, 0, -1] }).map((a) => a.tipo)).toEqual(['SAAS_DOWN'])
    expect(detectarAnomalias(null, null, { estadosRecientes: [429, 429, 429] })).toEqual([])
  })

  it('SCHEMA_BEHIND cuando la base reporta una migración anterior a la esperada', () => {
    const esperado = '20261101000000_otra'
    expect(detectarAnomalias(null, base(), { schemaEsperado: esperado }).map((a) => a.tipo)).toEqual(['SCHEMA_BEHIND'])
    expect(detectarAnomalias(null, base(), { schemaEsperado: '20261020220000_ops-metricas' })).toEqual([])
    expect(detectarAnomalias(null, base({ schema_version: null }), { schemaEsperado: esperado })).toHaveLength(1)
  })
})

describe('validarUrlPublica', () => {
  it('acepta un dominio público https', () => {
    expect('url' in validarUrlPublica('https://bitacora.tryvex.tech')).toBe(true)
    expect('url' in validarUrlPublica('https://app.example.com/base')).toBe(true)
  })
  it.each([
    'http://bitacora.tryvex.tech',
    'https://localhost',
    'https://api.localhost',
    'https://127.0.0.1',
    'https://10.0.0.5',
    'https://169.254.169.254',
    'https://2130706433',
    'https://0x7f.1',
    'https://[::1]',
    'https://[fd00::1]',
    'https://8.8.8.8',
    'https://intranet',
    'https://db.internal',
    'https://nas.local',
    'https://user:pass@bitacora.tryvex.tech',
    'https://bitacora.tryvex.tech?x=1',
    'no es url',
  ])('rechaza %s', (url) => {
    expect('error' in validarUrlPublica(url)).toBe(true)
  })
})

describe('pedirMetricas', () => {
  const ENV = {
    MONITOREO_URL_BITACORA: 'https://bitacora.tryvex.tech',
    MONITOREO_TOKEN_BITACORA: 'token-bitacora',
    MONITOREO_URL_OTRO: 'https://otro.example.com',
    MONITOREO_TOKEN_OTRO: 'token-otro',
  }
  const nuncaLlamado = async () => { throw new Error('no debía pedir nada') }

  it('sin el par de variables completo no pide nada y deja error', async () => {
    for (const env of [{}, { MONITOREO_URL_BITACORA: ENV.MONITOREO_URL_BITACORA }, { MONITOREO_TOKEN_BITACORA: 'x' }]) {
      const r = await pedirMetricas('BITACORA', nuncaLlamado, env)
      expect(r).toMatchObject({ httpStatus: 0, metricas: null })
      expect(r.error).toMatch(/MONITOREO_URL_BITACORA o MONITOREO_TOKEN_BITACORA/)
    }
  })

  it('una URL de entorno que es IP o localhost se rechaza sin pedir', async () => {
    for (const url of ['https://127.0.0.1', 'https://localhost', 'https://169.254.169.254']) {
      const r = await pedirMetricas('BITACORA', nuncaLlamado, { MONITOREO_URL_BITACORA: url, MONITOREO_TOKEN_BITACORA: 't' })
      expect(r.httpStatus).toBe(0)
      expect(r.error).toMatch(/IP|interna|dominio/)
    }
  })

  it('cada clave usa solo su propio token y su propia URL', async () => {
    const vistos: [string, string | null][] = []
    const f: typeof fetch = async (url, init) => {
      vistos.push([String(url), new Headers(init?.headers).get('authorization')])
      return new Response(JSON.stringify(MUESTRA_CONTRATO), { status: 200 })
    }
    await pedirMetricas('BITACORA', f, ENV)
    await pedirMetricas('OTRO', f, ENV)
    expect(vistos).toEqual([
      ['https://bitacora.tryvex.tech/api/ops/metrics', 'Bearer token-bitacora'],
      ['https://otro.example.com/api/ops/metrics', 'Bearer token-otro'],
    ])
    // Una clave con nombre de variable ajena no lee nada fuera de su par.
    expect((await pedirMetricas('SUPABASE_SERVICE_ROLE_KEY', nuncaLlamado, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'x' })).httpStatus).toBe(0)
    expect((await pedirMetricas('bitacora', nuncaLlamado, ENV)).error).toBe('Clave de SaaS no válida')
  })

  it('valida el payload', async () => {
    const r = await pedirMetricas('BITACORA', async () => new Response(JSON.stringify(MUESTRA_CONTRATO), { status: 200 }), ENV)
    expect(r.error).toBeNull()
    expect(r.metricas?.organizations).toHaveLength(2)
  })

  it('corta la descarga apenas el cuerpo pasa 1 MB, sin leer el resto', async () => {
    let entregados = 0
    const trozo = new Uint8Array(256 * 1024).fill(32)
    const infinito = new ReadableStream<Uint8Array>({
      pull(c) { entregados++; c.enqueue(trozo) },
    })
    const r = await pedirMetricas('BITACORA', async () => new Response(infinito, { status: 200 }), ENV)
    expect(r).toMatchObject({ httpStatus: 200, metricas: null, error: 'Respuesta demasiado grande' })
    expect(entregados * trozo.byteLength).toBeLessThan(MAX_BYTES + 3 * trozo.byteLength)
  })

  it('rechaza de entrada un content-length mayor a 1 MB', async () => {
    const res = new Response('{}', { status: 200, headers: { 'content-length': String(MAX_BYTES + 1) } })
    const r = await pedirMetricas('BITACORA', async () => res, ENV)
    expect(r.error).toBe('Respuesta demasiado grande')
  })

  it('un 200 con payload malo queda como error con el crudo guardado', async () => {
    const r = await pedirMetricas('BITACORA', async () => new Response('{"schema":"otro"}', { status: 200 }), ENV)
    expect(r.metricas).toBeNull()
    expect(r.crudo).toEqual({ schema: 'otro' })
    expect(r.error).toMatch(/Payload inválido/)
  })

  it('una falla de red devuelve status 0 sin lanzar', async () => {
    const r = await pedirMetricas('BITACORA', async () => { throw new TypeError('fetch failed') }, ENV)
    expect(r).toMatchObject({ httpStatus: 0, error: 'No se pudo conectar' })
  })
})
