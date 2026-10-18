/**
 * ¿Este mensaje saliente ya está en el hilo?
 *
 * El agente de WhatsApp puede reportar el MISMO mensaje más de una vez: al
 * mandarlo y otra vez cuando el socket le devuelve el eco de lo que él mismo
 * envió. La base tiene un índice único sobre `wa_message_id`, pero es PARCIAL
 * (`where wa_message_id is not null`) y la referencia que manda el agente es un
 * contador que se reinicia — así que llega en `null` o repetida, y en los dos
 * casos el índice deja pasar el duplicado.
 *
 * Por eso la comparación es por contenido dentro de una ventana corta.
 *
 * ⚠️ Solo para SALIENTES, a propósito. Un lead que escribe «ok» dos veces en un
 * minuto está mandando dos mensajes de verdad, y colapsarlos sería borrarle
 * palabras a una persona. Del lado de Tryvex el mismo texto repetido en menos
 * de un minuto es, en la práctica, el eco del agente.
 */

/** Cuánto hacia atrás se mira. Los duplicados observados llegan con segundos de diferencia. */
export const VENTANA_DUPLICADO_MS = 60_000

export interface MensajeComparable {
  texto: string
  direccion: string
  created_at: string
}

/** Mismo texto salvo espacios de más: el agente a veces recorta o agrega uno. */
function mismoTexto(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

export function esDuplicadoSaliente(
  candidato: { texto: string },
  recientes: MensajeComparable[],
  ahora: Date = new Date(),
): boolean {
  const desde = ahora.getTime() - VENTANA_DUPLICADO_MS

  return recientes.some((m) => {
    if (m.direccion !== 'out') return false
    if (!mismoTexto(m.texto, candidato.texto)) return false

    const t = new Date(m.created_at).getTime()
    // Una fecha ilegible no puede hacer que se descarte un mensaje: ante la
    // duda se guarda. Un duplicado se borra; un mensaje perdido no se recupera.
    if (Number.isNaN(t)) return false
    return t >= desde && t <= ahora.getTime()
  })
}
