import { describe, expect, it } from 'vitest'
import { aTexto, decimal, porcentajeDe, redondearTexto, sumar } from './decimal'
import { MetricasV1Schema, type MetricasV1 } from './esquema'
import { detectarAnomalias } from './anomalias'
import { calcularComision } from './comision'
import { pedirMetricas } from './cliente'

const SELLO_A = 'a'.repeat(64)
const SELLO_B = 'b'.repeat(64)

function pago(month: string, currency: string, reg: string, anu = '0', regCount = 1, anuCount = 0) {
  return { month, currency, registered: { count: regCount, total: reg }, annulled: { count: anuCount, total: anu } }
}

function base(over: Partial<MetricasV1> = {}): MetricasV1 {
  return {
    schema: 'tryvex.metrics/v1',
    project: 'bitacora-coach',
    generated_at: '2026-10-20T12:00:00Z',
    version: 'a16e751',
    schema_version: '20261020220000_ops-metricas',
    organizations: [{
      slug: 'johandri',
      reseller: null,
      students: { active: 10, paused: '<3' },
      subscriptions: { active: 10, expiring_7d: 2, grace: 1, expired: 0 },
      payments: [pago('2026-09', 'CLP', '100000'), pago('2026-10', 'CLP', '50000')],
      seals: [{ month: '2026-09', sha256: SELLO_A }],
    }],
    ...over,
  }
}

function conOrg(m: MetricasV1, cambios: Partial<MetricasV1['organizations'][number]>): MetricasV1 {
  return { ...m, organizations: [{ ...m.organizations[0], ...cambios }] }
}

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
  it('suma organizaciones con decimales exactos (0.1 + 0.2) y aplica el porcentaje', () => {
    const m = base({
      organizations: [
        { ...base().organizations[0], slug: 'a', payments: [pago('2026-09', 'USD', '0.1')], seals: [] },
        { ...base().organizations[0], slug: 'b', payments: [pago('2026-09', 'USD', '0.2', '0.05', 1, 1)], seals: [] },
      ],
    })
    const [fila] = calcularComision(m, 10)
    expect(fila).toEqual({
      mes: '2026-09', moneda: 'USD', cerrado: true, pagos: 2, anulaciones: 1,
      registrado: '0.3', anulado: '0.05', comision: '0.03',
    })
  })

  it('separa por moneda, ordena mes desc y marca el mes en curso como abierto', () => {
    const m = conOrg(base(), {
      payments: [pago('2026-09', 'USD', '10'), pago('2026-10', 'CLP', '50000'), pago('2026-09', 'CLP', '100000')],
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
  it.each([
    ['total como número', (m: MetricasV1) => conOrg(m, { payments: [{ ...pago('2026-09', 'CLP', '1'), registered: { count: 1, total: 1 as unknown as string } }] })],
    ['total negativo', (m: MetricasV1) => conOrg(m, { payments: [pago('2026-09', 'CLP', '-5')] })],
    ['campo desconocido', (m: MetricasV1) => ({ ...m, extra: true }) as MetricasV1],
    ['schema equivocado', (m: MetricasV1) => ({ ...m, schema: 'tryvex.metrics/v2' }) as unknown as MetricasV1],
    ['sello no hex', (m: MetricasV1) => conOrg(m, { seals: [{ month: '2026-09', sha256: 'xyz' }] })],
    ['mes inválido', (m: MetricasV1) => conOrg(m, { payments: [pago('2026-13', 'CLP', '1')] })],
    ['moneda en minúscula', (m: MetricasV1) => conOrg(m, { payments: [pago('2026-09', 'clp', '1')] })],
    ['pago duplicado', (m: MetricasV1) => conOrg(m, { payments: [pago('2026-09', 'CLP', '1'), pago('2026-09', 'CLP', '2')] })],
    ['slug con email', (m: MetricasV1) => conOrg(m, { slug: 'a@b.cl' })],
  ])('rechaza %s', (_caso, romper) => {
    expect(MetricasV1Schema.safeParse(romper(base())).success).toBe(false)
  })
})

describe('detectarAnomalias', () => {
  it('sin cambios no alerta', () => {
    expect(detectarAnomalias(base(), base(), { estadosRecientes: [200, 200, 200] })).toEqual([])
  })

  it('SEAL_CHANGED cuando un mes cerrado cambia de sello', () => {
    const actual = conOrg(base(), { seals: [{ month: '2026-09', sha256: SELLO_B }] })
    const alertas = detectarAnomalias(base(), actual)
    expect(alertas).toEqual([{
      tipo: 'SEAL_CHANGED', clave: 'johandri|2026-09',
      detalle: { organizacion: 'johandri', mes: '2026-09', antes: SELLO_A, ahora: SELLO_B },
    }])
  })

  it('SEAL_CHANGED cuando el sello desaparece dentro de la ventana, pero no si salió de ella', () => {
    expect(detectarAnomalias(base(), conOrg(base(), { seals: [] }))[0]?.tipo).toBe('SEAL_CHANGED')
    const viejo = conOrg(base(), { seals: [{ month: '2025-09', sha256: SELLO_A }] })
    expect(detectarAnomalias(viejo, conOrg(base(), { seals: [] }))).toEqual([])
  })

  it('REVENUE_DECREASED cuando baja el registrado de un mes cerrado (y no en el mes abierto)', () => {
    const actual = conOrg(base(), { payments: [pago('2026-09', 'CLP', '99999.99'), pago('2026-10', 'CLP', '1')] })
    const alertas = detectarAnomalias(base(), actual)
    expect(alertas).toEqual([{
      tipo: 'REVENUE_DECREASED', clave: 'johandri|2026-09|CLP',
      detalle: { organizacion: 'johandri', mes: '2026-09', moneda: 'CLP', antes: '100000', ahora: '99999.99' },
    }])
  })

  it('REVENUE_DECREASED cuando la fila del mes cerrado desaparece', () => {
    const actual = conOrg(base(), { payments: [pago('2026-10', 'CLP', '50000')] })
    expect(detectarAnomalias(base(), actual).map((a) => a.detalle.ahora)).toEqual(['0'])
  })

  it('ANNULMENTS_SPIKE sobre 20 % (no en 20 % exacto)', () => {
    const justo = conOrg(base(), { payments: [pago('2026-09', 'CLP', '100', '20')] })
    expect(detectarAnomalias(null, justo)).toEqual([])
    const sobre = conOrg(base(), { payments: [pago('2026-09', 'CLP', '100', '20.01')] })
    expect(detectarAnomalias(null, sobre).map((a) => a.tipo)).toEqual(['ANNULMENTS_SPIKE'])
    const todoAnulado = conOrg(base(), { payments: [pago('2026-09', 'CLP', '0', '5')] })
    expect(detectarAnomalias(null, todoAnulado).map((a) => a.tipo)).toEqual(['ANNULMENTS_SPIKE'])
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

describe('pedirMetricas', () => {
  const ENV = 'MONITOREO_TOKEN_PRUEBA'

  it('no lee variables fuera del prefijo permitido', async () => {
    const r = await pedirMetricas('https://x.test', 'SUPABASE_SERVICE_ROLE_KEY', async () => new Response('{}'))
    expect(r).toMatchObject({ httpStatus: 0, metricas: null })
  })

  it('envía el Bearer y valida el payload', async () => {
    process.env[ENV] = 'secreto'
    let auth: string | null = null
    const r = await pedirMetricas('https://x.test/', ENV, async (url, init) => {
      expect(String(url)).toBe('https://x.test/api/ops/metrics')
      auth = new Headers(init?.headers).get('authorization')
      return new Response(JSON.stringify(base()), { status: 200 })
    })
    expect(auth).toBe('Bearer secreto')
    expect(r.error).toBeNull()
    expect(r.metricas?.project).toBe('bitacora-coach')
  })

  it('un 200 con payload malo queda como error con el crudo guardado', async () => {
    process.env[ENV] = 'secreto'
    const r = await pedirMetricas('https://x.test', ENV, async () => new Response('{"schema":"otro"}', { status: 200 }))
    expect(r.metricas).toBeNull()
    expect(r.crudo).toEqual({ schema: 'otro' })
    expect(r.error).toMatch(/Payload inválido/)
  })

  it('una falla de red devuelve status 0 sin lanzar', async () => {
    process.env[ENV] = 'secreto'
    const r = await pedirMetricas('https://x.test', ENV, async () => { throw new TypeError('fetch failed') })
    expect(r).toMatchObject({ httpStatus: 0, error: 'No se pudo conectar' })
  })
})
