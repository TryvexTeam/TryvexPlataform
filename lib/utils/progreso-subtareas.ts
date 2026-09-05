/**
 * Avance de los pasos (subtareas) de una tarea, para pintarlo en el tablero.
 *
 * Vive aparte de los componentes porque el tablero y el modal de pasos tienen
 * que contar EXACTAMENTE igual: si el modal dice 3/8 y la tarjeta dice 2/8, el
 * equipo deja de creerle a los dos. Es lógica pura, así que se puede probar sin
 * montar nada.
 */

/** Lo mínimo que hace falta para contar: no se traen descripciones al tablero. */
export type FilaProgreso = { tarea_id: string; completada: boolean }

export type ProgresoSubtareas = { hechas: number; total: number }

/** Avance por tarea, indexado por id de tarea. */
export type MapaProgreso = Record<string, ProgresoSubtareas>

/**
 * Agrupa filas sueltas de `subtareas` en un conteo por tarea.
 *
 * Se agrupa acá y no con un `count` por tarjeta a propósito: el tablero pinta
 * decenas de tarjetas y una consulta por cada una es el problema N+1 clásico.
 * Se hace UNA consulta que trae `tarea_id` + `completada` y se cuenta en
 * memoria, que para este volumen es gratis.
 *
 * Una tarea SIN subtareas no aparece en el mapa (no está en la tabla): eso es
 * lo que deja que la tarjeta distinga "0 de 5 pasos" de "esta tarea no usa
 * pasos" y no muestre nada en el segundo caso.
 */
export function agruparProgresoSubtareas(filas: FilaProgreso[]): MapaProgreso {
  const mapa: MapaProgreso = {}
  for (const fila of filas) {
    const actual = mapa[fila.tarea_id] ?? { hechas: 0, total: 0 }
    actual.total += 1
    if (fila.completada) actual.hechas += 1
    mapa[fila.tarea_id] = actual
  }
  return mapa
}

/**
 * Porcentaje de avance, de 0 a 100.
 *
 * Con `total` en 0 devuelve 0 en vez de NaN: un NaN acaba en la hoja de estilo
 * como `width: NaN%`, que el navegador descarta en silencio y deja la barra
 * llena o vacía según lo que hubiera antes. Mejor un cero explícito.
 */
export function porcentajeProgreso(progreso: ProgresoSubtareas): number {
  if (progreso.total <= 0) return 0
  return Math.round((progreso.hechas / progreso.total) * 100)
}
