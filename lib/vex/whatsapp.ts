import { normalizarTelefono } from "./telefono";

/**
 * Envío por WhatsApp vía la API oficial de Meta (WhatsApp Cloud API).
 *
 * Reglas de WhatsApp que condicionan el diseño:
 *  - El PRIMER mensaje a alguien que no te escribió debe ser una PLANTILLA
 *    pre-aprobada por Meta (no texto libre). Por eso el primer contacto manda
 *    una plantilla con el nombre del negocio como variable.
 *  - Recién cuando el lead responde se abre una ventana de 24h para texto libre.
 *
 * Config por entorno (todo opcional: si falta, el servicio queda "no configurado"
 * y los endpoints responden con un aviso claro en vez de romper):
 *   WHATSAPP_TOKEN            -> token de acceso (System User token, larga duración)
 *   WHATSAPP_PHONE_NUMBER_ID  -> ID del número dado de alta en Cloud API
 *   WHATSAPP_TEMPLATE_NAME    -> nombre de la plantilla aprobada (ej. "primer_contacto")
 *   WHATSAPP_TEMPLATE_LANG    -> código de idioma de la plantilla (ej. "es" o "es_CL")
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigurado(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_TEMPLATE_NAME
  );
}

export type ResultadoWhatsApp =
  | { ok: true; proveedorId: string | null }
  | { ok: false; error: string };

/**
 * Manda la plantilla de primer contacto a `telefono`, con `nombreNegocio` como
 * variable {{1}} del cuerpo. Devuelve el id del mensaje de Meta si salió.
 */
export async function enviarPlantillaPrimerContacto(
  telefono: string | null | undefined,
  nombreNegocio: string,
  fetchFn: typeof fetch = fetch
): Promise<ResultadoWhatsApp> {
  if (!whatsappConfigurado()) {
    return { ok: false, error: "WhatsApp no está configurado (faltan WHATSAPP_TOKEN / PHONE_NUMBER_ID / TEMPLATE_NAME)." };
  }

  const numero = normalizarTelefono(telefono);
  if (!numero) return { ok: false, error: "Teléfono inválido para WhatsApp." };

  const body = {
    messaging_product: "whatsapp",
    to: numero,
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "es" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: nombreNegocio }],
        },
      ],
    },
  };

  try {
    const res = await fetchFn(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: json.error?.message || `Error HTTP ${res.status}` };
    }
    return { ok: true, proveedorId: json.messages?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red enviando WhatsApp." };
  }
}
