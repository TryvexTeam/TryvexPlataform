/**
 * Lee los datos crudos que el scraper saca de Google Maps y los deja en algo
 * que un modelo pueda usar sin inventar.
 *
 * Por qué existe: los campos se guardan tal como aparecen en Maps, sin
 * etiquetar. Dárselos crudos al redactor produjo dos mentiras reales el
 * 17-ago-2026:
 *
 *  - `info_texto = "4,8\n(256)"` (calificación y reseñas) se convirtió en
 *    *"256 personas buscan barberías como la tuya cada semana"*.
 *  - `localidad = "Pto San Francisco, Av. El Peral 3642 con, 8150000 Puente
 *    Alto, Región Metropolitana"` se convirtió en *"En Pto San Francisco"*,
 *    que es el nombre de un pasaje, no de la comuna.
 *
 * Un dato sin etiqueta es material para alucinar. La regla acá es simple: si no
 * se puede interpretar con confianza, se devuelve `null` y el prompt se queda
 * sin ese ángulo — nunca con una versión inventada.
 */

export type ReputacionGoogle = {
  /** Estrellas, 1 a 5. */
  calificacion: number
  /** Cuántas reseñas la sostienen. */
  resenas: number
}

/**
 * Saca la calificación y el número de reseñas de `info_texto`.
 *
 * El formato del scraper es la calificación, un salto de línea, y las reseñas
 * entre paréntesis: `"4,8\n(256)"`. En Chile la coma es el separador decimal, y
 * los miles vienen con punto: `"4,9\n(1.204)"`.
 */
export function leerReputacion(infoTexto: string | null | undefined): ReputacionGoogle | null {
  if (!infoTexto) return null

  // Los paréntesis son obligatorios: son lo único que distingue "4,8 (256)" de
  // un "4,8" suelto. Sin exigirlos, "4,8" se leía como 4 estrellas y 8 reseñas
  // — un número inventado, que es justo lo que este archivo existe para evitar.
  // Sin la bandera `s`: no hace falta (el `\s*` ya cruza el salto de línea que
  // trae el scraper) y el target de compilación del repo no la soporta.
  const m = infoTexto.trim().match(/^([0-9](?:[.,][0-9])?)\s*\(\s*([\d.,]+)\s*\)/)
  if (!m) return null

  const calificacion = Number(m[1].replace(',', '.'))
  // Los separadores de miles se van; no hay reseñas decimales.
  const resenas = Number(m[2].replace(/[.,]/g, ''))

  if (!Number.isFinite(calificacion) || calificacion < 1 || calificacion > 5) return null
  if (!Number.isInteger(resenas) || resenas < 1) return null

  return { calificacion, resenas }
}

/**
 * Saca la comuna de la dirección completa de Maps.
 *
 * Viene como `"Pto San Francisco, Av. El Peral 3642 con, 8150000 Puente Alto,
 * Región Metropolitana"`. La comuna es el tramo que trae el código postal de 7
 * dígitos: `"8150000 Puente Alto"` → `"Puente Alto"`.
 *
 * Ante la duda devuelve `null`: escribirle a alguien nombrando mal su comuna es
 * peor que no nombrarla.
 */
export function leerComuna(localidad: string | null | undefined): string | null {
  if (!localidad) return null

  const tramos = localidad.split(',').map((t) => t.trim()).filter(Boolean)

  // El tramo con código postal es el que trae la comuna al lado.
  for (const tramo of tramos) {
    const m = tramo.match(/^\d{7}\s+(.+)$/)
    if (m) {
      const comuna = m[1].trim()
      if (comuna.length >= 3) return comuna
    }
  }

  // Sin código postal: si hay al menos tres tramos, el penúltimo suele ser la
  // comuna y el último la región. Solo se acepta si no parece una calle.
  if (tramos.length >= 3) {
    const posible = tramos[tramos.length - 2]
    const pareceCalle = /\d|^(av|avda|avenida|calle|pasaje|psje|camino)\b/i.test(posible)
    if (!pareceCalle && posible.length >= 3) return posible
  }

  return null
}
