import { comparar, decimal, superaFraccion } from './decimal'
import { inicioVentana, type MesV1, type MetricasV1 } from './esquema'
import type { AlertaNueva } from '@/lib/types/monitoreo'

/** Anulado sobre registrado que dispara ANNULMENTS_SPIKE (estrictamente mayor). */
export const UMBRAL_ANULACIONES_PCT = 20
/** Pulls fallidos seguidos que cuentan como caída. */
export const FALLOS_PARA_CAIDA = 3

export interface ContextoAnomalias {
  /**
   * Estado HTTP de los pulls más recientes, del más nuevo al más viejo,
   * INCLUYENDO el actual. 0 = sin respuesta. Un 200 con payload inválido se
   * pasa como -1 (cuenta como falla).
   */
  estadosRecientes?: number[]
  /** Última migración que `main` del SaaS ya tiene. */
  schemaEsperado?: string | null
}

/**
 * Compara el último pull válido (`previo`) con el actual y devuelve las alertas.
 * Pura: no lee la base ni el reloj. `previo` o `actual` nulos se toleran (primer
 * pull, o el actual falló): lo que necesita ambos simplemente no se evalúa.
 */
export function detectarAnomalias(
  previo: MetricasV1 | null,
  actual: MetricasV1 | null,
  contexto: ContextoAnomalias = {},
): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  if (previo && actual) {
    alertas.push(...sellosCambiados(previo, actual), ...ingresosQueBajan(previo, actual))
  }
  if (actual) {
    alertas.push(...picosDeAnulaciones(actual), ...schemaAtrasado(actual, contexto.schemaEsperado))
  }
  const caida = saasCaido(contexto.estadosRecientes ?? [])
  if (caida) alertas.push(caida)
  return alertas
}

/**
 * Meses por organización: org_ref → mes → fila. Se indexa por `org_ref` y no
 * por slug: el slug es una etiqueta que el coach puede cambiar, y renombrar no
 * debe parecer (ni esconder) una alteración de cifras.
 */
function indexar(m: MetricasV1): Map<string, Map<string, MesV1>> {
  return new Map(m.organizations.map((o) => [o.org_ref, new Map(o.payments.map((p) => [p.month, p]))]))
}

/**
 * Meses que ya estaban cerrados en el pull previo. Solo esos se comparan: un
 * mes en curso puede cambiar legítimamente, y el mes que recién cierra todavía
 * no tiene contra qué compararse.
 */
function* mesesCerradosPrevios(previo: MetricasV1, ventana: string) {
  for (const org of previo.organizations) {
    for (const mes of org.payments) {
      // Un mes que salió de la ventana de 12 meses deja de reportarse: no es alteración.
      if (mes.closed && mes.month >= ventana) yield { ref: org.org_ref, mes }
    }
  }
}

/** Slug para mostrar: el actual si la organización sigue, si no el del pull previo. */
function etiquetasDe(previo: MetricasV1, actual: MetricasV1): Map<string, string> {
  return new Map([...previo.organizations, ...actual.organizations].map((o) => [o.org_ref, o.slug]))
}

function sellosCambiados(previo: MetricasV1, actual: MetricasV1): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  const actuales = indexar(actual)
  const etiquetas = etiquetasDe(previo, actual)
  for (const { ref, mes } of mesesCerradosPrevios(previo, inicioVentana(actual.generated_at))) {
    const slug = etiquetas.get(ref) ?? ref
    if (mes.seal === null) continue
    const ahora = actuales.get(ref)?.get(mes.month)?.seal ?? null
    if (ahora === mes.seal) continue
    alertas.push({
      tipo: 'SEAL_CHANGED',
      clave: `${ref}|${mes.month}`,
      detalle: { org_ref: ref, organizacion: slug, mes: mes.month, antes: mes.seal, ahora },
    })
  }
  return alertas
}

function ingresosQueBajan(previo: MetricasV1, actual: MetricasV1): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  const actuales = indexar(actual)
  const etiquetas = etiquetasDe(previo, actual)
  for (const { ref, mes } of mesesCerradosPrevios(previo, inicioVentana(actual.generated_at))) {
    const slug = etiquetas.get(ref) ?? ref
    const mesActual = actuales.get(ref)?.get(mes.month)
    for (const [moneda, montos] of Object.entries(mes.by_currency)) {
      // Una moneda (o un mes) que desaparece en un mes cerrado es un total que bajó a cero.
      const ahora = mesActual?.by_currency[moneda]?.registered.total ?? '0'
      if (comparar(decimal(ahora), decimal(montos.registered.total)) >= 0) continue
      alertas.push({
        tipo: 'REVENUE_DECREASED',
        clave: `${ref}|${mes.month}|${moneda}`,
        detalle: {
          org_ref: ref, organizacion: slug, mes: mes.month, moneda,
          antes: montos.registered.total, ahora,
        },
      })
    }
  }
  return alertas
}

function picosDeAnulaciones(actual: MetricasV1): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  for (const org of actual.organizations) {
    for (const mes of org.payments) {
      for (const [moneda, montos] of Object.entries(mes.by_currency)) {
        const anulado = decimal(montos.annulled.total)
        if (anulado.unidades === BigInt(0)) continue
        if (!superaFraccion(anulado, decimal(montos.registered.total), UMBRAL_ANULACIONES_PCT)) continue
        alertas.push({
          tipo: 'ANNULMENTS_SPIKE',
          clave: `${org.org_ref}|${mes.month}|${moneda}`,
          detalle: {
            org_ref: org.org_ref, organizacion: org.slug, mes: mes.month, moneda,
            registrado: montos.registered.total, anulado: montos.annulled.total,
            umbral_pct: UMBRAL_ANULACIONES_PCT,
          },
        })
      }
    }
  }
  return alertas
}

/**
 * 429 no cuenta: el SaaS limita a 1 pedido por minuto y un "Actualizar ahora"
 * pegado al cron no es una caída. Tampoco corta la racha: se salta.
 */
function saasCaido(estados: number[]): AlertaNueva | null {
  const relevantes = estados.filter((s) => s !== 429).slice(0, FALLOS_PARA_CAIDA)
  if (relevantes.length < FALLOS_PARA_CAIDA) return null
  if (relevantes.some((s) => s === 200)) return null
  return { tipo: 'SAAS_DOWN', clave: 'saas', detalle: { ultimos_estados: relevantes } }
}

function schemaAtrasado(actual: MetricasV1, esperado: string | null | undefined): AlertaNueva[] {
  if (!esperado) return []
  // Los nombres de migración empiezan con su fecha: el orden de texto es el orden real.
  if (actual.schema_version !== null && actual.schema_version >= esperado) return []
  return [{
    tipo: 'SCHEMA_BEHIND',
    clave: esperado,
    detalle: { esperado, reportado: actual.schema_version },
  }]
}
