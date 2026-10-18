import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { parseFechaLocal } from './fecha-santiago'

/**
 * Parte una lista de tareas en grupos por mes de vencimiento.
 *
 * El tablero apila las tarjetas una debajo de otra: con trece en una columna,
 * lo de más abajo deja de existir. Plegar la columna entera no lo arregla —
 * esconde todo o no esconde nada. Lo que sirve es poder abrir un mes y dejar
 * los otros cerrados.
 *
 * Orden, decidido por Cristian el 11-sep-2026:
 *   1. "Sin fecha" arriba del todo, para que no se olviden de ponerle una.
 *   2. Después los meses del más viejo al más nuevo: lo que lleva más tiempo
 *      esperando queda primero.
 *
 * Un mes sin tareas no aparece: un encabezado vacío es una fila que se
 * scrollea para no leer nada.
 */
export interface GrupoPorMes<T> {
  /** Estable entre renders: es la clave con la que se recuerda si está plegado. */
  id: string
  titulo: string
  items: T[]
  /**
   * Cuántas del grupo van atrasadas. Se pinta en rojo en el contador: un mes
   * plegado tiene que poder gritar que adentro hay algo vencido, si no plegarlo
   * se vuelve una forma cómoda de no enterarse.
   */
  atrasadas: number
}

/** Lo que necesita saber de una tarea para agruparla. */
interface ConFechaLimite {
  fecha_limite: string | null
}

export const SIN_FECHA = 'sin-fecha'

export function agruparPorMes<T extends ConFechaLimite>(
  items: T[],
  estaAtrasada?: (item: T) => boolean,
): GrupoPorMes<T>[] {
  const contarAtrasadas = (lista: T[]) =>
    estaAtrasada ? lista.filter(estaAtrasada).length : 0

  const sinFecha: T[] = []
  const porMes = new Map<string, T[]>()

  for (const item of items) {
    if (!item.fecha_limite) {
      sinFecha.push(item)
      continue
    }
    // `parseFechaLocal` y no `new Date`: una fecha 'YYYY-MM-DD' suelta se
    // interpreta como UTC, y en Chile eso puede caer el día anterior — el 1 de
    // septiembre terminaría agrupado en agosto.
    const fecha = parseFechaLocal(item.fecha_limite)
    const clave = format(fecha, 'yyyy-MM')
    const lista = porMes.get(clave)
    if (lista) lista.push(item)
    else porMes.set(clave, [item])
  }

  const grupos: GrupoPorMes<T>[] = []

  if (sinFecha.length > 0) {
    // Sin fecha no puede estar atrasada: no hay contra qué compararla.
    grupos.push({ id: SIN_FECHA, titulo: 'Sin fecha', items: sinFecha, atrasadas: 0 })
  }

  for (const clave of [...porMes.keys()].sort()) {
    const items = porMes.get(clave)!
    // El año solo se escribe cuando no es el actual: "Septiembre" se entiende
    // solo; "Septiembre 2025" hace falta para no confundirlo con este.
    const fecha = parseFechaLocal(`${clave}-01`)
    const mismoAno = fecha.getFullYear() === new Date().getFullYear()
    const titulo = format(fecha, mismoAno ? 'LLLL' : "LLLL yyyy", { locale: es })
    // Dentro del mes, lo que vence antes va primero.
    const ordenadas = items.sort((a, b) =>
      (a.fecha_limite ?? '').localeCompare(b.fecha_limite ?? ''),
    )
    grupos.push({
      id: clave,
      titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
      items: ordenadas,
      atrasadas: contarAtrasadas(ordenadas),
    })
  }

  return grupos
}
