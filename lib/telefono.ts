/**
 * Teléfonos chilenos en formato E.164.
 *
 * El porqué: un `tel:` o un `wa.me` solo marcan si el número lleva código de país.
 * En la base los teléfonos venían escritos a mano ("+56 9 2915 9103", "920394617",
 * vacío), y un botón de "llamar" con eso adentro falla en silencio: el usuario toca
 * y no pasa nada. Este módulo es la única puerta de entrada: todo lo que se guarde o
 * se muestre pasa por acá, y lo que no se reconoce se descarta en vez de inventarse.
 *
 * Nota: `lib/vex/telefono.ts` hace algo parecido pero permisivo (para armar links de
 * WhatsApp a leads externos, donde perder un número es peor que guardarlo sucio).
 * Este módulo es el estricto, para datos propios del equipo.
 */

/** Plan de numeración chileno: 9 dígitos nacionales, el primero entre 2 y 9 (9 = móvil, 2 = fija Santiago). */
const NACIONAL_CL = /^[2-9][0-9]{8}$/

/** E.164 chileno ya normalizado. Espeja el CHECK de la migración 034. */
const E164_CL = /^\+56[2-9][0-9]{8}$/

/**
 * Lleva un teléfono escrito a mano a E.164 chileno (`+569XXXXXXXX`).
 *
 * Acepta espacios, guiones, paréntesis y puntos; el prefijo `56` con o sin `+`;
 * ceros de salida a la izquierda (`0`, `00`); móviles (9…) y red fija (2…).
 * Devuelve `null` ante cualquier cosa que no calce: es preferible un campo vacío
 * a un número que no marca.
 */
export function normalizarTelefonoCL(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null

  // Solo dígitos: el `+` no aporta información que no esté en el largo del número.
  const digitos: string = valor.replace(/\D/g, '')
  if (digitos.length === 0) return null

  // Ceros de salida a la izquierda ("0 9 2915 9103", "0056…"): no son parte del número.
  const sinCeros: string = digitos.replace(/^0+/, '')

  // Con código de país: 56 + los 9 nacionales.
  const nacional: string =
    sinCeros.length === 11 && sinCeros.startsWith('56')
      ? sinCeros.slice(2)
      : sinCeros

  // Cualquier otro largo (8 dígitos sueltos, 12+, basura) queda fuera a propósito:
  // completar un número incompleto sería adivinar a quién llama el botón.
  if (!NACIONAL_CL.test(nacional)) return null

  return `+56${nacional}`
}

/** `true` solo si el valor puede convertirse en un E.164 chileno marcable. */
export function esTelefonoValido(valor: string | null | undefined): boolean {
  return normalizarTelefonoCL(valor) !== null
}

/**
 * Formato de lectura para la ficha: `+56 9 2915 9103`.
 * Si le llega algo que no es E.164 chileno lo devuelve tal cual, para no romper
 * el render de datos legados que todavía no pasaron por la migración.
 */
export function telefonoLegible(e164: string): string {
  if (!E164_CL.test(e164)) return e164

  const nacional: string = e164.slice(3)
  return `+56 ${nacional.slice(0, 1)} ${nacional.slice(1, 5)} ${nacional.slice(5)}`
}

/** URL para el botón de llamar. `tel:` exige el `+` para marcar internacional. */
export function urlLlamada(e164: string): string {
  return `tel:${e164}`
}

/** URL de WhatsApp. wa.me no acepta el `+`: espera solo dígitos. */
export function urlWhatsApp(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, '')}`
}
