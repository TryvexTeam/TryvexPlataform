import { z } from 'zod'

/**
 * Contrato `tryvex.metrics/v1`, lado CRM.
 *
 * Estricto a propósito: un campo desconocido o un total escrito como número
 * hace fallar el pull completo en vez de aceptar a medias. Si el SaaS cambia la
 * forma, tiene que subir de versión del contrato; lo contrario es dejar que un
 * cambio silencioso altere las cifras con las que se cobra.
 */

export const SCHEMA_ID = 'tryvex.metrics/v1'

// Misma forma que `src/features/ops-metrics/schemas/metrics.ts` en Bitácora
// (rama feat/ops-metricas), fuente de verdad del contrato. Acá se agregan topes
// (dígitos, tamaños) para que un valor fuera de rango no llegue a la aritmética.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** Mes de REGISTRO del pago (created_at), no de cobro. */
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MONEDA_RE = /^[A-Z]{3}$/
const SHA256_RE = /^[0-9a-f]{64}$/
/** Id estable de la organización; el slug es solo etiqueta y puede cambiar. */
const ORG_REF_RE = /^[0-9a-f]{16}$/
/** Siempre 2 decimales; el tope de 15 enteros es el mismo que admite `decimal()`. */
const MONTO_RE = /^(0|[1-9]\d{0,14})\.\d{2}$/

const Conteo = z.number().int().nonnegative()

const Agregado = z.strictObject({
  count: Conteo,
  total: z.string().regex(MONTO_RE, 'Total con formato decimal inválido'),
})

const Mes = z.strictObject({
  month: z.string().regex(MES_RE),
  closed: z.boolean(),
  /** sha256 de los pagos del mes; null en el mes en curso. */
  seal: z.string().regex(SHA256_RE).nullable(),
  by_currency: z.record(
    z.string().regex(MONEDA_RE),
    z.strictObject({ registered: Agregado, annulled: Agregado }),
  ),
})

const Organizacion = z
  .strictObject({
    org_ref: z.string().regex(ORG_REF_RE),
    slug: z.string().regex(SLUG_RE),
    reseller: z.string().regex(SLUG_RE).nullable(),
    students: z.strictObject({ active: Conteo, blocked: Conteo }),
    subscriptions: z.strictObject({
      active: Conteo,
      expiring_7d: Conteo,
      grace: Conteo,
      expired: Conteo,
    }),
    payments: z.array(Mes).max(12),
  })
  .superRefine((org, ctx) => {
    const meses = new Set<string>()
    for (const p of org.payments) {
      if (meses.has(p.month)) ctx.addIssue({ code: 'custom', message: `Mes duplicado ${p.month}` })
      meses.add(p.month)
    }
  })

export const MetricasV1Schema = z
  .strictObject({
    schema: z.literal(SCHEMA_ID),
    project: z.string().min(1).max(100),
    generated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    version: z.string().regex(/^[0-9a-f]{7,40}$/).nullable(),
    schema_version: z.string().min(1).max(200).nullable(),
    organizations: z.array(Organizacion).max(1000),
  })
  .superRefine((m, ctx) => {
    const refs = new Set<string>()
    for (const o of m.organizations) {
      if (refs.has(o.org_ref)) ctx.addIssue({ code: 'custom', message: `Organización duplicada ${o.org_ref}` })
      refs.add(o.org_ref)
    }
  })

export type MetricasV1 = z.infer<typeof MetricasV1Schema>
export type OrganizacionV1 = MetricasV1['organizations'][number]
export type MesV1 = OrganizacionV1['payments'][number]

/** Primer mes de la ventana de 12 meses que cubre la respuesta. */
export function inicioVentana(generadoEn: string): string {
  const d = new Date(generadoEn)
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1))
  return inicio.toISOString().slice(0, 7)
}
