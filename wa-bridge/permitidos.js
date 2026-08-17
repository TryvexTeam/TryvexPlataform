// wa-bridge/permitidos.js
//
// Modo prueba: mientras se pilotea con el numero PERSONAL de alguien, el puente
// solo puede tocar las conversaciones autorizadas.
//
// Por que existe: el puente guarda TODO mensaje entrante y, si el numero no
// corresponde a ningun lead, CREA una ficha con ese numero y el texto
// (crearLeadDesdeNumeroDesconocido). Con un numero comercial eso es correcto
// — no se pierde un cliente potencial. Con un numero personal significa que la
// familia y los amigos terminan en la base de la empresa, legibles por todo el
// equipo, sin haberlo consentido nunca.
//
// Lista vacia = sin filtro, el comportamiento de siempre. El filtro es opt-in
// para que sacarlo sea borrar una linea del .env y no revertir codigo.

/** Deja un telefono en solo digitos, para comparar sin importar el formato. */
function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/** Lee WA_BRIDGE_SOLO_NUMEROS y devuelve la lista de numeros normalizados. */
export function parsearPermitidos(cadena) {
  return String(cadena ?? '')
    .split(',')
    .map(soloDigitos)
    .filter(Boolean)
}

/**
 * ¿Este numero se puede tocar?
 *
 * Con la lista vacia pasa todo (modo prueba apagado). Con lista, un numero
 * ausente o ilegible NO pasa: ante la duda, no se guarda nada de nadie.
 */
export function estaPermitido(numero, permitidos) {
  if (!permitidos || permitidos.length === 0) return true
  const limpio = soloDigitos(numero)
  if (!limpio) return false
  return permitidos.includes(limpio)
}
