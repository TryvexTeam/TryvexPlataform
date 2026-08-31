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
