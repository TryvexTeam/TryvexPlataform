/**
 * Normaliza un teléfono a formato internacional sin símbolos, apto para wa.me.
 * Heurística para Chile (código país 56): si no trae código y parece móvil
 * chileno (9 dígitos empezando en 9), antepone 56. Devuelve null si no hay
 * suficientes dígitos para ser un número válido.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const d = telefono.replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("56")) return d;
  if (d.length === 9) return "56" + d; // número chileno de 9 dígitos (móvil 9.. o fijo 2..)
  // 8 dígitos: ANTES se devolvía "569" + d, o sea que se inventaba un móvil.
  // En Chile 8 dígitos es casi siempre un fijo sin código de área, así que ese
  // "9" convertía un fijo en el celular de otra persona — y esta función está
  // en el camino de ENVÍO (app/api/wa/send y lib/vex/whatsapp): decide a quién
  // le llega el mensaje. `lib/telefono.ts` ya lo decía: "completar un número
  // incompleto sería adivinar a quién llama el botón".
  if (d.length === 8) return null;
  return d; // 10+ dígitos: ya trae código de país; se usa tal cual
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
