/**
 * Un sondeo que solo corre mientras la pantalla está a la vista.
 *
 * Nace de repetir tres veces el mismo bloque en el CRM (el hilo del chat, el
 * panel de WhatsApp del detalle, el contador de no leídos) y de que la versión
 * del chat era la única que NO paraba: seguía preguntando cada 5 segundos con
 * el CRM minimizado toda la tarde. Eso es gasto puro, y encima es una ilusión:
 * el navegador congela los temporizadores de las pestañas en segundo plano, así
 * que un intervalo "corriendo" ahí no corre — dispara tarde y en ráfaga al
 * volver. Mejor pararlo a propósito y pedir de una al volver, que es justo el
 * momento en que la persona mira la pantalla.
 *
 * La fuente de visibilidad se inyecta para poder probar esto sin navegador: el
 * runner de tests de este repo corre en node y no tiene `document`.
 */

/** De dónde se sabe si la pantalla está a la vista. */
export interface FuenteVisibilidad {
  /** ¿Se está viendo ahora mismo? */
  visible(): boolean
  /** Avisa cuando eso cambia. Devuelve cómo dejar de escuchar. */
  alCambiar(cb: () => void): () => void
}

/** La del navegador de verdad. Solo se puede llamar dentro del cliente. */
export function visibilidadDelNavegador(): FuenteVisibilidad {
  return {
    visible: () => document.visibilityState === 'visible',
    alCambiar(cb) {
      // `focus` además de `visibilitychange`: cambiar de ventana sin minimizar
      // no siempre dispara el segundo, y ahí es cuando alguien vuelve al CRM.
      document.addEventListener('visibilitychange', cb)
      window.addEventListener('focus', cb)
      return () => {
        document.removeEventListener('visibilitychange', cb)
        window.removeEventListener('focus', cb)
      }
    },
  }
}

export interface OpcionesSondeo {
  /** Cada cuánto repetir, mientras se esté mirando. */
  cadaMs: number
  /** Lo que hay que hacer. Se llama también al volver a la pestaña. */
  tarea: () => void
  visibilidad: FuenteVisibilidad
}

/**
 * Arranca el sondeo. Devuelve la función que lo apaga todo — pensada para
 * devolverse tal cual desde el `return` de un `useEffect`.
 *
 * La primera pasada se difiere un tick a propósito: `tarea` suele escribir
 * estado de React, y hacerlo en el cuerpo del efecto dispara la regla
 * `react-hooks/set-state-in-effect`. Diferirlo la respeta sin cambiar nada de
 * lo que ve la persona.
 */
export function iniciarSondeoVisible({ cadaMs, tarea, visibilidad }: OpcionesSondeo): () => void {
  let intervalo: ReturnType<typeof setInterval> | null = null
  let vivo = true

  const parar = () => {
    if (intervalo !== null) {
      clearInterval(intervalo)
      intervalo = null
    }
  }

  const arrancar = () => {
    if (intervalo === null) intervalo = setInterval(() => tarea(), cadaMs)
  }

  const primera = setTimeout(() => {
    if (!vivo) return
    if (visibilidad.visible()) {
      tarea()
      arrancar()
    }
  }, 0)

  const alCambiar = () => {
    if (!vivo) return
    if (visibilidad.visible()) {
      // Al volver se pide de una, sin esperar el ciclo completo: si el cliente
      // contestó mientras la pestaña estaba en otra cosa, lo que no puede pasar
      // es que la pantalla siga mostrando el hilo de antes.
      tarea()
      arrancar()
    } else {
      parar()
    }
  }

  const dejarDeEscuchar = visibilidad.alCambiar(alCambiar)

  return () => {
    vivo = false
    clearTimeout(primera)
    parar()
    dejarDeEscuchar()
  }
}
