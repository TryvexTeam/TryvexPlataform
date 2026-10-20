import { comparar, decimal, superaFraccion, aTexto } from './decimal'
import { esMesCerrado, inicioVentana, type MetricasV1 } from './esquema'
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

function sellosCambiados(previo: MetricasV1, actual: MetricasV1): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  const ventana = inicioVentana(actual.generated_at)
  const orgsActuales = new Map(actual.organizations.map((o) => [o.slug, o]))

  for (const orgPrevia of previo.organizations) {
    const orgActual = orgsActuales.get(orgPrevia.slug)
    const sellosActuales = new Map((orgActual?.seals ?? []).map((s) => [s.month, s.sha256]))
    for (const sello of orgPrevia.seals) {
      // Un mes que salió de la ventana de 12 meses deja de reportarse: no es alteración.
      if (sello.month < ventana) continue
      const ahora = sellosActuales.get(sello.month) ?? null
      if (ahora === sello.sha256) continue
      alertas.push({
        tipo: 'SEAL_CHANGED',
        clave: `${orgPrevia.slug}|${sello.month}`,
        detalle: { organizacion: orgPrevia.slug, mes: sello.month, antes: sello.sha256, ahora },
      })
    }
  }
  return alertas
}

function ingresosQueBajan(previo: MetricasV1, actual: MetricasV1): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  const ventana = inicioVentana(actual.generated_at)
  const totalesActuales = new Map<string, string>()
  for (const org of actual.organizations) {
    for (const p of org.payments) totalesActuales.set(`${org.slug}|${p.month}|${p.currency}`, p.registered.total)
  }

  for (const org of previo.organizations) {
    for (const p of org.payments) {
      if (p.month < ventana || !esMesCerrado(p.month, actual.generated_at)) continue
      const clave = `${org.slug}|${p.month}|${p.currency}`
      // Una fila que desaparece en un mes cerrado es un total que bajó a cero.
      const ahora = totalesActuales.get(clave) ?? '0'
      if (comparar(decimal(ahora), decimal(p.registered.total)) >= 0) continue
      alertas.push({
        tipo: 'REVENUE_DECREASED',
        clave,
        detalle: {
          organizacion: org.slug, mes: p.month, moneda: p.currency,
          antes: p.registered.total, ahora: aTexto(decimal(ahora)),
        },
      })
    }
  }
  return alertas
}

function picosDeAnulaciones(actual: MetricasV1): AlertaNueva[] {
  const alertas: AlertaNueva[] = []
  for (const org of actual.organizations) {
    for (const p of org.payments) {
      const anulado = decimal(p.annulled.total)
      if (anulado.unidades === BigInt(0)) continue
      if (!superaFraccion(anulado, decimal(p.registered.total), UMBRAL_ANULACIONES_PCT)) continue
      alertas.push({
        tipo: 'ANNULMENTS_SPIKE',
        clave: `${org.slug}|${p.month}|${p.currency}`,
        detalle: {
          organizacion: org.slug, mes: p.month, moneda: p.currency,
          registrado: p.registered.total, anulado: p.annulled.total, umbral_pct: UMBRAL_ANULACIONES_PCT,
        },
      })
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
