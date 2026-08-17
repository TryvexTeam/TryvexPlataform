import { construirLinkWhatsApp } from "./telefono";
import { llmJSON } from "./llm";
import type { LeadResumen } from "./cartera";

export const AGENDA_URL = "https://tryvex.tech";

type Canal = "whatsapp" | "social";

/** Borrador multicanal generado para un lead. Solo trae los canales que el lead tiene. */
export type DraftLead = {
  lead_id: string;
  nombre: string;
  telefono: string | null;
  whatsapp: { text: string; link: string | null } | null;
  social: { text: string } | null;
  aviso?: string;
};

type DraftIA = {
  whatsapp_text?: string;
  social_text?: string;
};

// Sin el `& { tiene_web?, info_texto? }` que tenía antes: esas columnas ahora
// son parte de LeadResumen y son requeridas. Repetirlas como opcionales no
// aportaba nada y era lo único que podía aflojar la garantía del compilador si
// mañana alguien las tocara — que es justo lo que dejó pasar este bug meses.
type LeadDraftInput = LeadResumen;

/**
 * Tres estados, no dos: sí, no, y **no sabemos**.
 *
 * Antes esto era `lead.tiene_web ? "Sí" : "No"`, y ahí se colaba la mentira: un
 * dato ausente se convertía en un "No" afirmativo, y el prompt le pide al
 * modelo abrir con "sin web = invisible cuando te buscan en Google". A un
 * negocio que sí tiene web, eso es falso en el primer renglón. El límite que
 * puso Cristian fue textual: "no información falsa".
 */
function estadoWeb(tieneWeb: boolean | null | undefined, urlWeb?: string | null): string {
  // Un "no tiene web" con una URL cargada al lado es un dato que se contradice
  // a sí mismo, y hay que tratarlo como desconocido. Pasa de verdad: el
  // formulario de alta traía `tiene_web: false` por defecto, así que alguien
  // podía escribir la dirección del negocio y dejar la casilla sin marcar. El
  // `false` que queda en la base parece medido y no lo es.
  if (tieneWeb !== true && urlWeb?.trim()) return "no sabemos"

  if (tieneWeb === true) return "Sí"
  if (tieneWeb === false) return "No"
  return "no sabemos"
}

/** ¿Se puede afirmar algo sobre la web de este negocio? */
function sabemosDeSuWeb(lead: LeadDraftInput): boolean {
  return estadoWeb(lead.tiene_web, lead.url_web) !== "no sabemos"
}

/** Un mensaje del hilo de WhatsApp con ese lead. */
export type TurnoWa = { direccion: "in" | "out"; texto: string };

/**
 * El pedazo de prompt con lo ya conversado, para que un segundo mensaje no
 * arranque de cero.
 *
 * Pedido de Cristian (17-ago): *"cuando queramos mandarle otro personalizado al
 * mismo cliente basándose en lo que ya se ha hablado"*.
 *
 * Se recortan los últimos turnos y cada uno a 400 caracteres: un hilo largo
 * empuja los datos del negocio fuera de la vista del modelo, y lo que importa
 * para retomar es el final de la conversación, no el principio.
 */
function bloqueHistorial(historial: TurnoWa[]): string {
  const turnos = historial.filter((t) => t.texto?.trim()).slice(-10)
  if (turnos.length === 0) return ""

  const conversacion = turnos
    .map((t) => `${t.direccion === "out" ? "Nosotros" : "El negocio"}: ${t.texto.trim().slice(0, 400)}`)
    .join("\n")

  return `
ESTE NEGOCIO YA FUE CONTACTADO. Lo conversado hasta ahora:
${conversacion}

No es un primer contacto: NO te presentes de nuevo ni repitas lo que ya se dijo.
Escribí el SIGUIENTE mensaje, retomando donde quedó. Si el negocio hizo una
pregunta que no está respondida, esa es la prioridad. Si quedó en silencio,
retomá con algo nuevo y concreto, sin reclamar la falta de respuesta.
⛔ No inventes precios, plazos ni compromisos que no aparezcan arriba.
`.trim()
}

function canalesDisponibles(lead: LeadDraftInput): Canal[] {
  const disponibles: Canal[] = [];
  if (lead.telefono) disponibles.push("whatsapp");
  if (lead.redes_sociales && Object.keys(lead.redes_sociales).length > 0) disponibles.push("social");
  return disponibles;
}

/**
 * Genera el borrador de outreach multicanal para UN lead con IA (Groq).
 * No envía nada: solo redacta. Copy de venta nivel experto con framework PAS:
 * (1) problema/gancho, (2) agitar el dolor, (3) solución (Tryvex), (4) CTA a agendar.
 */
export async function generarDraftLead(
  lead: LeadDraftInput,
  customPrompt?: string,
  llm: (prompt: string) => Promise<string> = llmJSON,
  historial: TurnoWa[] = []
): Promise<DraftLead> {
  const disponibles = canalesDisponibles(lead);

  const base: DraftLead = {
    lead_id: lead.id,
    nombre: lead.nombre_negocio,
    telefono: lead.telefono ?? null,
    whatsapp: null,
    social: null,
  };

  if (disponibles.length === 0) {
    return { ...base, aviso: "Sin canal de contacto (sin teléfono ni redes)." };
  }

  const nicho = lead.nicho ? lead.nicho.toLowerCase() : "negocio";
  const ubicacion = lead.localidad || "su zona";

  const prompt = `
Eres un COPYWRITER de respuesta directa de élite (nivel Ogilvy/Halbert) trabajando para
Tryvex, una agencia que digitaliza negocios locales: páginas web rápidas, aparecer en Google,
automatización de reseñas y embudos de venta. Tu único trabajo es escribir mensajes que hagan
que el dueño QUIERA agendar una llamada. No vendes "una web": vendes MÁS CLIENTES y plata que
hoy se está yendo a la competencia.

Escribe un mensaje 1-a-1, hecho a medida para ESTE negocio (nada de plantilla genérica),
usando el framework PAS:
1) PROBLEMA (gancho): abre con una frase específica y real sobre SU situación que le pegue
   en el primer segundo. Usa sus datos (sin web = invisible cuando alguien lo busca en Google).
   Nada de "Espero que estés bien" ni relleno.
2) AGITAR: hazle sentir el costo de no hacer nada. Concreto: cada semana hay clientes que lo
   buscan, no lo encuentran (o no confían) y terminan comprándole al competidor que SÍ está
   online. Es plata real perdida, no un problema técnico abstracto.
3) SOLUCIÓN (no la saltes, es clave): explica claramente que NOSOTROS, Tryvex, somos quienes
   lo resolvemos y CÓMO. Nombra 2-3 cosas concretas que hacemos por él, atadas a su dolor:
   le creamos/mejoramos su sitio web para que lo encuentren, lo posicionamos en Google y Maps,
   le ordenamos las reseñas para que generen confianza, y le armamos el camino para que ese
   visitante termine comprando. Dilo en resultado, no en jerga ("que te encuentren y te elijan",
   no "stack moderno"). Deja claro que es Tryvex quien lo hace por él, llave en mano, sin que
   tenga que entender de tecnología. Posiciónate como el experto que ya lo hizo con negocios como el suyo.
4) CTA: invítalo a una llamada corta y sin compromiso para mostrarle exactamente qué cambiar.
   Baja la fricción ("15 min", "sin costo", "te muestro 2-3 cosas concretas"). Que dé ganas de
   agendar AHORA.

Reglas de oro:
- Específico > genérico. Honesto: no inventes datos ni prometas resultados falsos.
- Frases cortas, lenguaje simple, confiado, cálido, chileno neutro. Cero sonar a robot o a spam.
- Habla de ÉL y sus clientes, no de ti. "Tú/tu negocio" mucho más que "nosotros".
- Sin exagerar, sin signos de exclamación de más, sin clichés de marketing vacíos.

Datos del lead:
- Negocio: ${lead.nombre_negocio}
- Nicho: ${nicho}
- Ubicación: ${ubicacion}
- ¿Tiene sitio web?: ${estadoWeb(lead.tiene_web, lead.url_web)}
- Info extra: ${lead.info_texto?.trim() || "N/A"}
${sabemosDeSuWeb(lead) ? "" : "\nNO SABEMOS si este negocio tiene sitio web. No menciones su web, ni que no aparece en Google, ni nada que dependa de ese dato: buscá el gancho en su rubro, su ubicación o la info extra.\n"}

${bloqueHistorial(historial)}

Canales a generar (genera SOLO estos): ${disponibles.join(", ")}.
${customPrompt ? `\nInstrucciones adicionales del usuario (priorízalas): ${customPrompt}\n` : ""}
Devuelve un objeto JSON con SOLO estas claves (las que correspondan a los canales pedidos):
- "whatsapp_text": versión corta y directa del mismo gancho+CTA, con el link ${AGENDA_URL}. 1 emoji máx si es natural.
- "social_text": versión breve para DM de red social, gancho+CTA, con el link ${AGENDA_URL}.
`.trim();

  let ia: DraftIA = {};
  try {
    ia = JSON.parse(await llm(prompt));
  } catch {
    return { ...base, aviso: "La IA no devolvió un JSON válido para este lead." };
  }

  const setDisp = new Set<Canal>(disponibles);

  const whatsappText = ia.whatsapp_text?.trim() || "";
  const whatsapp = setDisp.has("whatsapp")
    ? { text: whatsappText, link: construirLinkWhatsApp(lead.telefono, whatsappText) }
    : null;

  const social = setDisp.has("social") ? { text: ia.social_text?.trim() || "" } : null;

  return { ...base, whatsapp, social };
}
