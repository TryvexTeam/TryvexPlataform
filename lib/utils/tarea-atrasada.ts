import { parseFechaLocal } from './fecha-santiago'

/**
 * ¿Esta tarea está atrasada?
 *
 * Una sola definición para todo el CRM. Antes esta regla vivía suelta dentro de
 * `tarea-card.tsx` como `isVencida`; en cuanto el atraso empezó a pintarse
 * también en los contadores de cada mes —y pronto en la página principal— tener
 * dos copias garantizaba que un día dijeran cosas distintas sobre la misma
 * tarea.
 *
 * Tres condiciones, y las tres importan:
 *   · tiene fecha límite (sin fecha no hay contra qué medir)
 *   · no está en 'listo' (lo terminado tarde ya no es deuda)
 *   · no está en la papelera (lo borrado no reclama nada)
 *
 * La comparación es por DÍA de Santiago, no por instante: una tarea que vence
 * hoy no está atrasada a las 9 de la mañana. Se pasa a estarlo mañana.
 */
export function tareaAtrasada(tarea: {
  fecha_limite: string | null
  estado: string
  eliminado_at?: string | null
}): boolean {
  if (!tarea.fecha_limite) return false
  if (tarea.estado === 'listo') return false
  if (tarea.eliminado_at) return false

  const hoy = new Date()
  const inicioDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return parseFechaLocal(tarea.fecha_limite) < inicioDeHoy
}
