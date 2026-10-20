import { z } from 'zod'
import { DECIMAL_RE } from './decimal'

/**
 * Contrato `tryvex.metrics/v1`, lado CRM.
 *
 * Estricto a propósito: un campo desconocido o un total escrito como número
 * hace fallar el pull completo en vez de aceptar a medias. Si el SaaS cambia la
 * forma, tiene que subir de versión del contrato; lo contrario es dejar que un
 * cambio silencioso altere las cifras con las que se cobra.
 */

export const SCHEMA_ID = 'tryvex.metrics/v1'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MONEDA_RE = /^[A-Z]{3}$/
const SHA256_RE = /^[0-9a-f]{64}$/

/** Conteo exacto o "<3": el origen esconde 1 y 2 para no identificar personas. */
const Conteo = z.union([z.number().int().nonnegative(), z.literal('<3')])

const Monto = z.string().regex(DECIMAL_RE, 'Total con formato decimal inválido')

const Agregado = z.strictObject({
  count: z.number().int().nonnegative(),
  total: Monto,
})

const PagoMes = z.strictObject({
  month: z.string().regex(MES_RE),
  currency: z.string().regex(MONEDA_RE),
  registered: Agregado,
  annulled: Agregado,
})

const Sello = z.strictObject({
  month: z.string().regex(MES_RE),
  sha256: z.string().regex(SHA256_RE),
})

const Organizacion = z
  .strictObject({
    slug: z.string().regex(SLUG_RE),
    reseller: z.string().regex(SLUG_RE).nullable(),
    students: z.record(z.string().regex(/^[a-z_]{1,40}$/), Conteo),
    subscriptions: z.strictObject({
      active: Conteo,
      expiring_7d: Conteo,
      grace: Conteo,
      expired: Conteo,
    }),
    payments: z.array(PagoMes).max(12 * 20),
    seals: z.array(Sello).max(12),
  })
  .superRefine((org, ctx) => {
    const pagos = new Set<string>()
    for (const p of org.payments) {
      const k = `${p.month}|${p.currency}`
      if (pagos.has(k)) ctx.addIssue({ code: 'custom', message: `Pago duplicado ${k}` })
      pagos.add(k)
    }
    const sellos = new Set<string>()
    for (const s of org.seals) {
      if (sellos.has(s.month)) ctx.addIssue({ code: 'custom', message: `Sello duplicado ${s.month}` })
      sellos.add(s.month)
    }
  })

export const MetricasV1Schema = z
  .strictObject({
    schema: z.literal(SCHEMA_ID),
    project: z.string().regex(SLUG_RE),
    generated_at: z.iso.datetime({ offset: true }),
    version: z.string().regex(/^[0-9a-f]{7,40}$/).nullable(),
    schema_version: z.string().min(1).max(200).nullable(),
    organizations: z.array(Organizacion).max(1000),
  })
  .superRefine((m, ctx) => {
    const slugs = new Set<string>()
    for (const o of m.organizations) {
      if (slugs.has(o.slug)) ctx.addIssue({ code: 'custom', message: `Organización duplicada ${o.slug}` })
      slugs.add(o.slug)
    }
  })

export type MetricasV1 = z.infer<typeof MetricasV1Schema>
export type OrganizacionV1 = MetricasV1['organizations'][number]

/** Mes "YYYY-MM" de una fecha ISO, en UTC (el SaaS sella en UTC). */
export function mesDe(iso: string): string {
  return iso.slice(0, 7)
}

/** Mes cerrado = anterior al mes en que se generó la respuesta. */
export function esMesCerrado(mes: string, generadoEn: string): boolean {
  return mes < mesDe(new Date(generadoEn).toISOString())
}

/** Primer mes de la ventana de 12 meses que cubre la respuesta. */
export function inicioVentana(generadoEn: string): string {
  const d = new Date(generadoEn)
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1))
  return inicio.toISOString().slice(0, 7)
}
