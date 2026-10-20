import { CERO, aTexto, decimal, porcentajeDe, sumar, type Decimal } from './decimal'
import { esMesCerrado, type MetricasV1 } from './esquema'
import type { FilaComision } from '@/lib/types/monitoreo'

/**
 * Lo que le corresponde a Tryvex por mes y moneda, sumando todas las
 * organizaciones del SaaS.
 *
 * La base es lo REGISTRADO: lo anulado ya viene aparte y no se cobra. Todo en
 * decimal exacto; el porcentaje entra como texto ("12.50") o número con hasta
 * 2 decimales, igual que la columna NUMERIC(5,2).
 *
 * Meses más nuevos primero; dentro del mes, monedas en orden alfabético.
 */
export function calcularComision(payload: MetricasV1, porcentaje: string | number): FilaComision[] {
  const pct = decimal(typeof porcentaje === 'number' ? porcentaje.toFixed(2) : porcentaje)
  const acumulado = new Map<string, {
    mes: string; moneda: string; registrado: Decimal; anulado: Decimal
    pagos: number; anulaciones: number
  }>()

  for (const org of payload.organizations) {
    for (const p of org.payments) {
      const clave = `${p.month}|${p.currency}`
      const fila = acumulado.get(clave) ?? {
        mes: p.month, moneda: p.currency, registrado: CERO, anulado: CERO, pagos: 0, anulaciones: 0,
      }
      acumulado.set(clave, {
        ...fila,
        registrado: sumar(fila.registrado, decimal(p.registered.total)),
        anulado: sumar(fila.anulado, decimal(p.annulled.total)),
        pagos: fila.pagos + p.registered.count,
        anulaciones: fila.anulaciones + p.annulled.count,
      })
    }
  }

  return [...acumulado.values()]
    .sort((a, b) => (a.mes === b.mes ? a.moneda.localeCompare(b.moneda) : b.mes.localeCompare(a.mes)))
    .map((f) => ({
      mes: f.mes,
      moneda: f.moneda,
      cerrado: esMesCerrado(f.mes, payload.generated_at),
      pagos: f.pagos,
      anulaciones: f.anulaciones,
      registrado: aTexto(f.registrado),
      anulado: aTexto(f.anulado),
      comision: aTexto(porcentajeDe(f.registrado, pct)),
    }))
}
