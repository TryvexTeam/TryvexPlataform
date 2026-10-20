import { CERO, aTexto, decimal, porcentajeDe, sumar, type Decimal } from './decimal'
import type { MetricasV1 } from './esquema'
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
    mes: string; moneda: string; cerrado: boolean; registrado: Decimal; anulado: Decimal
    pagos: number; anulaciones: number
  }>()

  for (const org of payload.organizations) {
    for (const mes of org.payments) {
      for (const [moneda, montos] of Object.entries(mes.by_currency)) {
        const clave = `${mes.month}|${moneda}`
        const fila = acumulado.get(clave) ?? {
          mes: mes.month, moneda, cerrado: true, registrado: CERO, anulado: CERO, pagos: 0, anulaciones: 0,
        }
        acumulado.set(clave, {
          ...fila,
          // Abierto si alguna organización todavía no lo cierra.
          cerrado: fila.cerrado && mes.closed,
          registrado: sumar(fila.registrado, decimal(montos.registered.total)),
          anulado: sumar(fila.anulado, decimal(montos.annulled.total)),
          pagos: fila.pagos + montos.registered.count,
          anulaciones: fila.anulaciones + montos.annulled.count,
        })
      }
    }
  }

  return [...acumulado.values()]
    .sort((a, b) => (a.mes === b.mes ? a.moneda.localeCompare(b.moneda) : b.mes.localeCompare(a.mes)))
    .map((f) => ({
      mes: f.mes,
      moneda: f.moneda,
      cerrado: f.cerrado,
      pagos: f.pagos,
      anulaciones: f.anulaciones,
      registrado: aTexto(f.registrado),
      anulado: aTexto(f.anulado),
      comision: aTexto(porcentajeDe(f.registrado, pct)),
    }))
}
