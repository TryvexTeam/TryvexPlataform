/**
 * El primer mensaje ya escrito que aparece en el chat de WhatsApp del lead.
 *
 * Existe porque escribir desde cero cada vez es fricción, no porque sea el
 * mensaje ideal: es un punto de partida editable.
 *
 * 🔴 Por qué se reescribió (15-sep-2026). Había DOS plantillas fijas, en dos
 * componentes distintos, y las dos afirmaban cosas que nadie había mirado:
 *
 *   lead-chat-wa.tsx      "Ayudamos a negocios como el tuyo a conseguir más
 *                          clientes con una página web lista en días"
 *   lead-whatsapp-panel   "Vimos que {negocio} TODAVÍA NO TIENE SITIO WEB"
 *
 * Las dos le ofrecían una página a cualquiera, y la segunda además afirmaba
 * que no tenía — a todos, siempre, sin mirar un solo dato. Ese mismo día
 * estuvimos toda la tarde arreglando exactamente eso en el redactor con IA,
 * mientras el texto por defecto lo decía a mano dos archivos más allá.
 *
 * La regla es la misma que para Vex: **solo se afirma lo que sabemos**.
 */

export type LeadParaSugerencia = {
  nombre_negocio: string | null
  tiene_web?: boolean | null
  url_web?: string | null
  google_rating?: number | null
  google_resenas?: number | null
}

/** Coma decimal, que es como se escribe en Chile. */
function comaDecimal(n: number): string {
  return String(n).replace('.', ',')
}

/**
 * ¿Podemos afirmar que NO tiene sitio? Solo cuando está medido y no hay una
 * URL cargada al lado contradiciéndolo. Un `false` con URL es un dato que se
 * contradice a sí mismo — pasa de verdad, el formulario de alta traía `false`
 * por defecto.
 */
function sabemosQueNoTieneWeb(lead: LeadParaSugerencia): boolean {
  return lead.tiene_web === false && !lead.url_web?.trim()
}

export function textoSugerido(lead: LeadParaSugerencia): string {
  const negocio = lead.nombre_negocio?.trim() || 'tu negocio'
  const saludo = `Hola 👋 ¿hablo con ${negocio}?\n\n`

  const rating = lead.google_rating
  const resenas = lead.google_resenas
  const tieneReputacion = rating != null || resenas != null

  // Caso 1: sabemos que no tiene sitio. Ofrecérselo es correcto y concreto.
  if (sabemosQueNoTieneWeb(lead)) {
    return (
      saludo +
      `Somos Tryvex. Hacemos páginas web para negocios como el tuyo, listas en ` +
      `días, con tus datos y tus reseñas a la vista. ¿Te muestro un ejemplo?`
    )
  }

  // Caso 2: tenemos su reputación. Es lo mejor que hay — es real y es suyo.
  if (tieneReputacion) {
    const cuanto =
      rating != null && resenas != null
        ? `tus ${resenas} reseñas con ${comaDecimal(rating)} estrellas`
        : resenas != null
          ? `tus ${resenas} reseñas`
          : `tus ${comaDecimal(rating as number)} estrellas`
    return (
      saludo +
      `Somos Tryvex. Vi ${cuanto} en Google — se nota el trabajo. ` +
      `¿Cómo llega hoy un cliente nuevo a ustedes, te escribe, te llama o pasa al local?`
    )
  }

  // Caso 3: no sabemos casi nada. Entonces no se afirma nada: se pregunta.
  return (
    saludo +
    `Somos Tryvex, trabajamos con negocios de Santiago. ` +
    `¿Cómo llega hoy un cliente nuevo a ustedes, te escribe, te llama o pasa al local?`
  )
}
