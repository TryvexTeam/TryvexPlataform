/**
 * El número de una demo, tal como Vex lo va a buscar: solo dígitos, con código
 * de país (56987652232).
 *
 * Vex pregunta por la demo con el número que le llega de WhatsApp. Si acá se
 * guarda distinto —con un 0 de más, sin el 56, con un dígito de menos— la
 * demo existe pero Vex nunca la encuentra, y el cliente recibe al asistente
 * de Tryvex en vez del de su negocio. Por eso lo dudoso se RECHAZA en vez de
 * guardarse "por si acaso": es mejor pedir que lo revisen que activar una demo
 * que no va a funcionar.
 *
 * Chile es el caso normal y se acepta en cualquiera de sus formas. Un número
 * extranjero se acepta solo si viene con `+` o `00`, que es lo que dice sin
 * ambigüedad que ya trae el código de país.
 */

/** Celular chileno: 9 + 8 dígitos. */
const CELULAR_CL = /^9\d{8}$/

export function normalizarTelefonoDemo(texto: string): string | null {
  // Solo lo que parece número: quita texto delante ("Tel: "), marcas invisibles
  // que trae WhatsApp al copiar, espacios duros, guiones y paréntesis.
  const limpio = texto.normalize('NFKC').replace(/[^\d+]/g, '')
  const internacional = /^(\+|00)/.test(limpio)
  let digitos = limpio.replace(/\D/g, '')
  if (limpio.startsWith('00')) digitos = digitos.slice(2)

  // El 0 de larga distancia que se anteponía antes: 09…, o +56 09…
  if (digitos.startsWith('560') && CELULAR_CL.test(digitos.slice(3))) digitos = `56${digitos.slice(3)}`
  if (digitos.startsWith('0') && CELULAR_CL.test(digitos.slice(1))) digitos = digitos.slice(1)

  if (CELULAR_CL.test(digitos)) return `56${digitos}`
  if (digitos.startsWith('56')) {
    // Chile con código: tiene que quedar un celular o un fijo completos.
    return /^56(9\d{8}|[2-7]\d{8})$/.test(digitos) ? digitos : null
  }
  if (internacional && /^[1-9]\d{7,14}$/.test(digitos)) return digitos
  return null
}

/** Cómo mostrárselo a una persona: "+56 9 8765 2232". */
export function formatearTelefonoDemo(digitos: string): string {
  const cl = /^56(9)(\d{4})(\d{4})$/.exec(digitos)
  return cl ? `+56 ${cl[1]} ${cl[2]} ${cl[3]}` : `+${digitos}`
}
