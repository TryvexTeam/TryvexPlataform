import { construirLinkWhatsApp } from "./telefono";
import { llmJSON } from "./llm";
import { leerComuna, leerReputacion } from "./negocio";
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
  const comuna = leerComuna(lead.localidad);
  const reputacion = leerReputacion(lead.info_texto);

  // Cada dato se entrega ETIQUETADO y solo si existe. Un valor crudo sin
  // explicar es material para inventar: "4,8 (256)" se convirtio una vez en
  // "256 personas buscan barberias como la tuya cada semana".
  const datos = [
    `- Nombre del negocio: ${lead.nombre_negocio}`,
    `- Rubro: ${nicho}`,
    comuna ? `- Comuna: ${comuna}` : "- Comuna: no la sabemos con certeza (NO nombres ninguna)",
    `- ¿Tiene sitio web?: ${estadoWeb(lead.tiene_web, lead.url_web)}`,
    reputacion
      ? `- Reputación en Google Maps: ${String(reputacion.calificacion).replace(".", ",")} estrellas con ${reputacion.resenas} reseñas`
      : "- Reputación en Google: no la tenemos (NO menciones estrellas ni reseñas)",
  ].join("\n");

  const prompt = `
Escribís mensajes de WhatsApp para Tryvex, un estudio chileno que le hace la página web a
negocios locales, los deja apareciendo en Google y Maps, y les ordena las reseñas para que
generen confianza. Le escribís al DUEÑO, que no te conoce y está trabajando.

Tu objetivo es una respuesta, no una venta. Que el dueño piense "esto me pasa a mí" y conteste.

## La estructura, en este orden y sin saltarte ninguna parte

1. SALUDO: saludá y preguntá si hablás con el negocio, por su nombre. Tal cual:
   "Hola, ¿hablo con <nombre del negocio>?". Es una pregunta, no un anuncio.
2. QUIÉN SOS: una línea. Que se entienda en el primer segundo quién escribe y a qué.
   Sin esto, sos un desconocido pidiendo algo — y nadie contesta eso.
3. EL PROBLEMA, CON SU DATO REAL: usá lo que sabemos de ESTE negocio (abajo) para mostrarle
   algo suyo que hoy le está costando plata. Concreto y verificable, nunca genérico.
4. CÓMO LO RESOLVEMOS: nombrá DOS O TRES cosas concretas que hacemos por él, atadas a lo que
   le dijiste en el punto 3. Del menú real: le hacemos la página, lo dejamos apareciendo
   cuando lo buscan en Google y en Maps, y le ponemos sus reseñas a la vista para que el que
   llega confíe. En resultado, no en jerga ("que te encuentren y te elijan", NUNCA "presencia
   online" ni "presencia digital" ni "soluciones"). Llave en mano: él no tiene que entender
   nada técnico.
5. LA INVITACIÓN: una llamada corta y sin compromiso. Baja la fricción: 15 minutos, sin costo,
   le mostramos un ejemplo de un negocio como el suyo. Cerrá con ${AGENDA_URL}

## Reglas duras

- ⛔ NO INVENTES NADA. Solo podés afirmar lo que está en los datos de abajo. Si un dato no
  está, ese ángulo no existe: buscá otro. Prohibido inventar cifras, cantidades de búsquedas,
  clientes perdidos, precios, plazos o nombres de competidores.
- Las estrellas y reseñas, si están, son de Google Maps: son su reputación ya ganada. Ese es
  el mejor ángulo que tenés — reputación real que no le está trayendo clientes nuevos porque
  no aparece cuando lo buscan. Citá el número tal cual, sin redondear ni adornar.
- Largo: entre 50 y 125 palabras. Menos que eso no alcanza para presentarse; más, no se lee.
- Chileno neutro, tuteo, cálido y directo. Frases cortas. Como le escribe una persona a otra,
  no como un aviso publicitario.
- ⛔ Le hablás AL DUEÑO, de tú: "no apareces", "tus reseñas", "tu barbería". NUNCA en tercera
  persona sobre su negocio ("no aparecen", "sus reseñas", "su visibilidad") ni de usted: suena
  a carta de banco, no a alguien que le escribe por WhatsApp.
- ⛔ Frases prohibidas por acartonadas o vacías: "me dirijo a", "por medio del presente",
  "presencia en línea", "presencia digital", "posicionamiento", "soluciones digitales",
  "espero que estés bien", "somos una empresa líder". Si te sale una, reescribí la frase.
- Si sabés la comuna, usala: le muestra que no es un mensaje masivo. Nombrala en el punto 3,
  atada a cómo lo buscan ("cuando alguien busca <rubro> en <comuna>...").
- Sin exclamaciones de más, sin clichés de marketing.
- Máximo 1 emoji, y solo si cae natural.

## Los datos de ESTE negocio (lo único que podés afirmar)

${datos}
${lead.info_texto && !reputacion ? `- Otra info del negocio: ${lead.info_texto.trim()}` : ""}
${sabemosDeSuWeb(lead) ? "" : "\n⚠️ NO SABEMOS si tiene sitio web. No menciones su web, ni Google, ni que no aparece: buscá el gancho en su rubro, su comuna o su reputación."}
${bloqueHistorial(historial)}

Canales a generar (genera SOLO estos): ${disponibles.join(", ")}.
${customPrompt ? `
Instrucciones adicionales del usuario (priorízalas): ${customPrompt}
` : ""}
Devuelve un objeto JSON con SOLO estas claves (las que correspondan a los canales pedidos):
- "whatsapp_text": el mensaje completo con las 5 partes, listo para enviar por WhatsApp.
- "social_text": lo mismo, adaptado a un mensaje directo de red social.
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
