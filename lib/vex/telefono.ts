/**
 * Normaliza un teléfono a formato internacional sin símbolos, apto para wa.me.
 * Heurística para Chile (código país 56): si no trae código y parece móvil
 * chileno (9 dígitos empezando en 9), antepone 56. Devuelve null si no hay
 * suficientes dígitos para ser un número válido.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const d = telefono.replace(/\D/g, "");
  // Chile: 9 dígitos nacionales, el primero de 2 a 9 (9 = móvil, 2 = fijo de
  // Santiago, 3-8 = otras zonas). Se valida la FORMA, no solo el largo: un
  // "123456789" o un "56" seguido de cualquier cosa no es un número chileno, y
  // esta función decide a quién le llega el mensaje. La misma regla vive en
  // wa-bridge/buzon.js: si difieren, el CRM acepta un envío que el puente
  // después rechaza, y el lead queda "contactado" sin que nada haya salido.
  if (/^56[2-9]\d{8}$/.test(d)) return d;
  if (/^[2-9]\d{8}$/.test(d)) return "56" + d;
  // 8 dígitos: ANTES se devolvía "569" + d, o sea que se inventaba un móvil.
  // En Chile 8 dígitos es casi siempre un fijo sin código de área, así que ese
  // "9" convertía un fijo en el celular de otra persona. `lib/telefono.ts` ya
  // lo decía: "completar un número incompleto sería adivinar a quién llama el
  // botón".
  if (d.length <= 9) return null;
  // 10+ dígitos que no empiezan con 56: extranjero con su código de país. Si
  // empieza con 56 y no calzó arriba, es un chileno mal escrito.
  if (d.startsWith("56")) return null;
  return d;
}

/**
 * Construye un link wa.me clicable con el mensaje pre-cargado (WhatsApp V1,
 * sin API oficial). Devuelve null si el teléfono no es utilizable.
 */
export function construirLinkWhatsApp(
  telefono: string | null | undefined,
  texto: string
): string | null {
  const num = normalizarTelefono(telefono);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
