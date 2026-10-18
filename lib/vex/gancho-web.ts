/**
 * El estado de su web como gancho del primer mensaje.
 *
 * El revisor de webs (`scraper/revisar_web.py`, `clasificar_sitio`) deja en
 * `web_capacidades.estado` qué encontró al abrir el sitio del negocio. Cuando
 * el sitio está roto o a medio hacer, ese es el mejor ángulo que existe: es
 * suyo, es concreto y el dueño lo puede comprobar en diez segundos. Antes el
 * mensaje no lo usaba y trataba a esos negocios como si no supiéramos nada.
 *
 * Dos cuidados que se repiten en todas las instrucciones:
 *  · El estado es una foto del día en que se revisó y pudo cambiar. Por eso va
 *    con fecha genérica ("cuando la revisamos") y nunca como verdad de hoy.
 *  · Se afirma SOLO lo que se vio. Un sitio caído no es "no tiene web".
 *
 * Las instrucciones van sin tildes por el mismo motivo técnico que el resto
 * del prompt en `draft.ts`.
 */

/** Estados que dan gancho. El resto (viva, desconocido, bloqueada) no dice nada útil. */
const GANCHOS: Record<string, (url: string | null) => string> = {
  en_obra: (url) =>
    `Su sitio${enDireccion(url)} estaba en construccion cuando lo revisamos: empezo una web y no la termino.` +
    " Ese es tu angulo: ofrecele terminar lo que ya empezo, no hacerle una pagina desde cero.",
  staging: (url) =>
    `Su sitio${enDireccion(url)} mostraba una version de prueba cuando lo revisamos, no una terminada.` +
    " Ese es tu angulo: ofrecele terminar y publicar lo que ya empezo.",
  caida: (url) =>
    `Su sitio${enDireccion(url)} no cargaba cuando lo revisamos.` +
    " Ese es tu angulo, pero dicho como un aviso util, con tacto: \"revisamos su web y no nos cargo, quizas ya lo saben\"." +
    " ⛔ Nada de burla ni de \"su web esta rota\": puede haber sido algo de ese dia.",
  vacia: (url) =>
    `Su dominio${enDireccion(url)} existe, pero cuando lo revisamos no mostraba contenido.` +
    " Ese es tu angulo: ya pago el dominio y todavia no le trae clientes.",
  parqueada: (url) =>
    `Su dominio${enDireccion(url)} esta a su nombre, pero cuando lo revisamos no tenia un sitio: solo la pagina por defecto del proveedor.` +
    " Ese es tu angulo: tiene la direccion, le falta lo que va adentro.",
}

function enDireccion(url: string | null): string {
  const u = url?.trim()
  return u ? ` (${u})` : ""
}

/**
 * La instrucción para el modelo según el estado de su web, o `null` si ese
 * estado no da un gancho (viva, desconocido, bloqueada, o sin revisar).
 */
export function ganchoPorEstadoWeb(
  estado: string | null | undefined,
  url: string | null,
): string | null {
  if (!estado) return null
  const armar = GANCHOS[estado]
  if (!armar) return null
  return (
    armar(url) +
    " ⛔ Afirma SOLO lo que se vio y siempre como algo de cuando lo revisamos: pudo cambiar." +
    " ⛔ NUNCA digas que \"no tiene web\": tiene una, y la esta pagando."
  )
}
