// wa-bridge/fila.js
//
// Una fila por numero, para que dos mensajes del mismo remitente no se pisen.
//
// Por que existe: el handler de entrantes pregunta "¿existe ficha para este
// numero?" y, si no existe, la crea. Cuando dos mensajes del mismo remitente
// llegaban casi juntos, ambos preguntaban, ambos escuchaban "no", y ambos
// creaban la ficha. El 16-ago-2026 eso dejo dos fichas duplicadas del mismo
// numero con 0,08 s de diferencia. Con volumen real, cada rafaga de mensajes
// habria duplicado fichas en el CRM del equipo.
//
// Serializar por numero (y no globalmente) mantiene el paralelismo entre
// personas distintas, que es donde importa, y de paso garantiza que los
// mensajes de una misma conversacion se guarden en el orden en que llegaron.

/** Crea una fila independiente. Una por proceso basta; se exporta la fabrica
 *  para que los tests no compartan estado entre casos. */
export function crearFila() {
  const enCurso = new Map()

  /**
   * Encola `tarea` detras de lo que ya haya pendiente para `clave`.
   * Devuelve el resultado (o el error) de la tarea, sin tragarselo.
   */
  function enFilaPara(clave, tarea) {
    const anterior = enCurso.get(clave) ?? Promise.resolve()
    // `.then(tarea, tarea)` a proposito: la fila sigue avanzando aunque la
    // tarea anterior haya fallado. Si cortaramos en el primer error, un fallo
    // suelto dejaria bloqueada para siempre la conversacion de esa persona.
    const actual = anterior.then(tarea, tarea)

    // Lo que se guarda en el Map es la version "sin errores": si guardaramos
    // `actual` tal cual, un rechazo sin manejar tumbaria el proceso.
    const registrada = actual.catch(() => {})
    enCurso.set(clave, registrada)

    // Limpieza: sin esto el Map crece con una entrada por cada numero que
    // escriba y nunca se vacia. Solo borra si nadie encolo detras mientras
    // tanto (comparar la referencia es lo que evita esa carrera).
    registrada.then(() => {
      if (enCurso.get(clave) === registrada) enCurso.delete(clave)
    })

    return actual
  }

  /** Cuantas claves tienen trabajo pendiente. Para tests y diagnostico. */
  enFilaPara.pendientes = () => enCurso.size

  return enFilaPara
}
