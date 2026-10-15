// wa-bridge/buzon.js
//
// La decision de que mandar, separada del ciclo que habla con la base y con
// WhatsApp: es la parte que se puede equivocar en silencio (mandarle a un
// telefono mal leido) y la unica barata de probar.

/**
 * Misma heuristica que lib/vex/telefono.ts del lado Next.js (duplicada a
 * proposito: wa-bridge es un proceso Node separado, con su propio
 * package.json, no comparte modulos con la app).
 *
 * Vive aca y no en index.js porque el buzon la necesita: antes el buzon solo
 * quitaba simbolos, y un lead guardado como "912345678" (sin el 56) salia
 * hacia 912345678@c.us, un numero que no existe. La API validaba con esta
 * misma regla, asi que el CRM decia "encolado" y el puente mandaba a otro lado.
 */
export function normalizarTelefono(telefono) {
  if (!telefono) return null
  const d = String(telefono).replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('56')) return d
  if (d.length === 9) return '56' + d
  if (d.length === 8) return '569' + d
  return d
}

/**
 * Traduce una fila encolada + su lead a un job de envio.
 * Devuelve null si NO se puede mandar (sin lead, sin telefono, telefono ilegible).
 */
export function aJobDeEnvio(fila, lead) {
  const telefono = normalizarTelefono(lead?.telefono)
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
    // Quien lo escribio de verdad (migracion 052). Sin esto, la autoria se
    // perdia al pasar del buzon a mensajes_wa.
    integrante_id: fila.integrante_id ?? null,
  }
}
