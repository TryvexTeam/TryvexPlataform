/**
 * Con qué claves buscar la fila a la que corresponde un acuse.
 *
 * El acuse llega con el id REAL de WhatsApp (`3EB0...`), pero cuando
 * `/api/wa/send` escribió la fila ese id todavía no existía: lo único que
 * teníamos era `referencia`, el id con el que el AGENTE metió el mensaje en su
 * propia cola. Por eso el `.eq('wa_message_id', ...)` original no podía
 * emparejar nada en los envíos hechos por el agente — matcheaba cero filas,
 * siempre, y la ruta respondía 404 sistemático.
 *
 * Se busca por las dos y, al encontrar, se sube el id real: los acuses
 * siguientes del mismo mensaje (entregado, leído) ya caen directo.
 */
export function clavesDeAcuse(
  waMessageId: string | null | undefined,
  referencia?: string | number | null,
): string[] {
  const claves: string[] = []

  const real = (waMessageId ?? '').trim()
  if (real) claves.push(real)

  if (referencia !== undefined && referencia !== null) {
    const ref = String(referencia).trim()
    // Si el agente manda la misma cadena en los dos campos, no se duplica: un
    // `.in()` con la clave repetida no rompe, pero deja la consulta confusa.
    if (ref && ref !== real) claves.push(ref)
  }

  return claves
}

/** Una fila de `mensajes_wa` candidata a recibir el acuse. */
export interface FilaCandidata {
  id: string
  lead_id: string | null
}

export type Emparejamiento =
  | { tipo: 'unico'; fila: FilaCandidata }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; filas: FilaCandidata[] }

/**
 * Cuál de las filas encontradas recibe el acuse — y cuándo NO decidirlo.
 *
 * `referencia` es el contador de la cola del agente (en la base: 26, 27, 28, 32).
 * Una cola en memoria vuelve a empezar en 1 al reiniciar, así que dos mensajes de
 * leads distintos pueden compartirla. Elegir `filas[0]` era elegir a cara o cruz:
 * se escribía el id real de WhatsApp sobre la fila ajena y la ficha equivocada
 * avanzaba a «contactado», todo en silencio.
 *
 * Con dos filas del MISMO lead tampoco se elige: el update estamparía el id real
 * en las dos y el acuse siguiente volvería a ser ambiguo, ahora sin arreglo.
 *
 * Es la regla que ya se aplicó al emparejar leads por teléfono el 21-ago: **si el
 * match no es único, no se adivina** — se deja para que lo resuelva una persona.
 */
export function elegirFilaDelAcuse(
  filas: FilaCandidata[] | null | undefined,
): Emparejamiento {
  const encontradas = filas ?? []
  if (encontradas.length === 0) return { tipo: 'ninguno' }
  if (encontradas.length === 1) return { tipo: 'unico', fila: encontradas[0] }
  return { tipo: 'ambiguo', filas: encontradas }
}

/**
 * ¿Esta clave se puede repetir en el tiempo?
 *
 * El id de WhatsApp (`3EB0...`) es irrepetible: empareja sin más. La referencia
 * del agente es un entero corto de su cola, y por eso quien busque por ella tiene
 * que acotar la búsqueda a lo reciente y sin acusar todavía.
 */
export function esClaveReusable(clave: string): boolean {
  const c = (clave ?? '').trim()
  // Un contador de cola: pocos dígitos. Un timestamp de 19 dígitos no lo es.
  return /^\d{1,9}$/.test(c)
}

/** Hasta dónde atrás vale emparejar por una clave reusable. */
export const VENTANA_REFERENCIA_HORAS = 24
