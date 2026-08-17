// wa-bridge/buzon.js
//
// La decision de que mandar, separada del ciclo que habla con la base y con
// WhatsApp: es la parte que se puede equivocar en silencio (mandarle a un
// telefono mal leido) y la unica barata de probar.

function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/**
 * Traduce una fila encolada + su lead a un job de envio.
 * Devuelve null si NO se puede mandar (sin lead, sin telefono, telefono ilegible).
 */
export function aJobDeEnvio(fila, lead) {
  const telefono = soloDigitos(lead?.telefono)
  if (!telefono) return null
  return {
    telefono,
    texto: fila.texto,
    lead_id: fila.lead_id,
    cliente_id: null,
    es_bot: false,
    // 'CRM' y no el nombre de alguien: si no vino atribucion, se dice que salio
    // del sistema en vez de adjudicarsela a una persona que no la escribio.
    enviado_por: fila.enviado_por || 'CRM',
  }
}
