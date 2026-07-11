/**
 * Normaliza un teléfono a formato internacional sin símbolos, apto para wa.me.
 * Heurística para Chile (código país 56): si no trae código y parece móvil
 * chileno (9 dígitos empezando en 9), antepone 56. Devuelve null si no hay
 * suficientes dígitos para ser un número válido.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("56")) return d;
  if (d.length === 9) return "56" + d; // número chileno de 9 dígitos (móvil 9.. o fijo 2..)
  if (d.length === 8) return "569" + d; // sin prefijo de 9 dígitos; asumir móvil
  return d; // ya trae código país u otro formato; se usa tal cual
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
