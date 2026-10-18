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
  // Chile: 9 digitos nacionales, el primero de 2 a 9 (9 = movil, 2 = fijo de
  // Santiago, 3-8 = otras zonas). Se valida la FORMA, no solo el largo: un
  // "123456789" o un "56" seguido de cualquier cosa no es un numero chileno, y
  // mandarle ahi es mandarle a alguien que no es el lead.
  if (/^56[2-9]\d{8}$/.test(d)) return d
  if (/^[2-9]\d{8}$/.test(d)) return '56' + d
  // 8 digitos: NO se completa con '569'. En Chile casi siempre es un fijo sin
  // codigo de area, y ese 9 convertia un fijo en el celular de otra persona.
  // Mismo criterio que lib/vex/telefono.ts: adivinar el numero es decidir a
  // quien le llega el mensaje.
  if (d.length <= 9) return null
  // 10+ digitos que no empiezan con 56: numero extranjero con su codigo de
  // pais. Empezar con 56 y no calzar arriba es un chileno mal escrito: null.
  if (d.startsWith('56')) return null
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
