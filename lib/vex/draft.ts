import { construirLinkWhatsApp } from "./telefono";
import { llmJSON, CuotaAgotada } from "./llm";
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

  // El rubro que Google le pone al negocio gana sobre el nuestro: `nicho`
  // guarda el termino con el que lo BUSCAMOS ("pizzerias"), y Google dice lo
  // que el negocio ES ("Restaurante italiano"). Escribirle por lo que es da un
  // mensaje mas al grano, sin inventar nada.
  const rubroGoogle = lead.categoria_google?.trim() || null;
  const nicho = rubroGoogle || (lead.nicho ? lead.nicho.toLowerCase() : "negocio");
  const comuna = leerComuna(lead.localidad);

  // La columna manda (migracion 047); si falta, se lee del crudo. Los leads que
  // entren por el scraper antes de que `crm_map.py` llene las columnas nuevas
  // solo van a traer `info_texto`, y quedarse sin el mejor angulo por eso seria
  // una lastima.
  const reputacion =
    lead.google_rating != null && lead.google_resenas != null
      ? { calificacion: Number(lead.google_rating), resenas: lead.google_resenas }
      : leerReputacion(lead.info_texto);

  // Cada dato se entrega ETIQUETADO y solo si existe. Un valor crudo sin
  // explicar es material para inventar: "4,8 (256)" se convirtio una vez en
  // "256 personas buscan barberias como la tuya cada semana".
  const datos = [
    `- Nombre del negocio: ${lead.nombre_negocio}`,
    rubroGoogle
      ? `- Rubro (asi lo clasifica Google): ${rubroGoogle}`
      : `- Rubro: ${nicho}`,
    comuna ? `- Comuna: ${comuna}` : "- Comuna: no la sabemos con certeza (NO nombres ninguna)",
    `- ¿Tiene sitio web?: ${estadoWeb(lead.tiene_web, lead.url_web)}`,
    reputacion
      ? `- Reputación en Google Maps: ${String(reputacion.calificacion).replace(".", ",")} estrellas con ${reputacion.resenas} reseñas`
      : "- Reputación en Google: no la tenemos (NO menciones estrellas ni reseñas)",
    lead.instagram
      ? `- Instagram del negocio: ${lead.instagram}`
      : "- Instagram: no sabemos si tiene (NO lo menciones)",
    // El horario es una FOTO del dia que se raspo Maps, no un calendario. Se
    // entrega con esa advertencia pegada para que el modelo no lo afirme como
    // si fuera fijo: decirle "cierras a las 7" a alguien que cambio el horario
    // es el mismo error de siempre, con otro dato.
    lead.horario
      ? `- Horario segun Google el dia que lo miramos (PUEDE haber cambiado, no lo afirmes como un hecho): ${lead.horario.replace(/\s+/g, " ").trim()}`
      : "- Horario: no lo tenemos (NO menciones horarios)",
  ].join("\n");

  const prompt = `
Escribes mensajes de WhatsApp para Tryvex, un estudio chileno de software. Le escribes al
DUENO de un negocio, que no te conoce y esta trabajando.

Tu objetivo es una respuesta, no una venta. Que el dueno piense "esto me pasa a mi" y conteste.

## Como se habla (esto es tan importante como el contenido)

- Espanol de CHILE, tuteo: "tienes", "quieres", "mira", "te encuentran".
- ⛔ PROHIBIDO el voseo argentino: nunca "tenes", "queres", "mira" con acento final, "sos",
  "vos", "podes", "fijate". Si te sale una, reescribe la frase completa.
- Con respeto y calidez, como le escribes a alguien mayor que trabaja: cercano pero sin
  palmearle la espalda. Nada de "hola crack", "amigo", "bro", ni exceso de confianza.
- Frases cortas, palabras simples. Como escribe una persona, no un aviso publicitario.
- ⛔ ORTOGRAFIA IMPECABLE en el mensaje: con todas sus tildes ("página", "reseñas", "rápido",
  "más", "aquí") y con los signos de apertura ("¿Quieres...?", "¡...!"). Estas instrucciones
  van sin tildes por un tema tecnico — el MENSAJE no. Un mensaje mal escrito le dice al dueno
  que no nos tomamos el trabajo en serio, y le estamos ofreciendo justamente hacerle algo bien.
- ⛔ Frases prohibidas por acartonadas o vacias: "me dirijo a", "por medio del presente",
  "presencia en linea", "presencia digital", "posicionamiento", "soluciones digitales",
  "espero que estes bien", "somos una empresa lider", "potenciar tu negocio".
- ⛔ Le hablas AL DUENO, de tu: "no apareces", "tus resenas", "tu barberia". Nunca en tercera
  persona sobre su negocio ("no aparecen", "sus resenas") ni de usted: suena a carta de banco.
- Maximo 1 emoji, y solo si cae natural.

## La estructura, en este orden y sin saltarte ninguna parte

1. SALUDO: saluda y pregunta si hablas con el negocio, por su nombre. Tal cual:
   "Hola, ¿hablo con <nombre del negocio>?". Es una pregunta, no un anuncio.
2. QUIEN ERES: una linea. Que se entienda en el primer segundo quien escribe y a que.
   Sin esto eres un desconocido pidiendo algo, y nadie contesta eso.
3. EL PROBLEMA, CON SU DATO REAL: usa lo que sabemos de ESTE negocio (abajo) para mostrarle
   algo suyo que hoy le esta costando plata. Concreto y verificable, nunca generico.
   Elige UN angulo, el mas fuerte que tengas. No los amontones: un mensaje que dice tres
   cosas a la vez no dice ninguna.

   ⭐ SUS ESTRELLAS Y RESENAS (el mejor, uselo siempre que este). Nombralas con el numero
   exacto. Es lo unico del mensaje que solo puede ser para el: reputacion que ya se gano
   trabajando y que hoy no le trae clientes nuevos, porque no aparece cuando lo buscan.

   📸 SU INSTAGRAM (fuerte, si lo tiene). El dueno ya hace el esfuerzo de mostrar su trabajo
   ahi, pero al que le gusta lo que ve no le queda donde reservar ni que precios hay: tiene
   que escribir un mensaje y esperar. Ese trabajo se le pierde a medias.

   🕐 SU HORARIO (el mas debil, solo si no tienes los otros). Sirve para una idea, no para
   citar la hora: cuando el local esta cerrado la gente igual lo busca, y a esa hora no hay
   nadie que conteste, pero una pagina si puede tomar el pedido o la hora.
   ⛔ NO afirmes su horario como un hecho ("cierras a las 7"): lo miramos un dia y pudo
   cambiar. Hablalo en general ("cuando cierras", "fuera del horario de atencion").
4. QUE LE ENTREGAMOS: elige del menu real de mas abajo lo que le sirva a EL. Nombra DOS o
   TRES cosas concretas, en resultado y no en jerga: "que te encuentren en Google", "que
   tus resenas se vean", "que puedan pedir hora sin escribirte". NUNCA "convertir", "captar
   trafico" ni palabras de marketing — el dueno de una barberia no habla asi. Cierra esta
   parte con el plazo real o la mantencion: es lo que vuelve creible la promesa.
5. LA INVITACION: una llamada corta y sin compromiso. Baja la friccion: 15 minutos, sin costo,
   le mostramos un ejemplo de un negocio como el suyo. Cierra con ${AGENDA_URL}

## Lo que Tryvex entrega de verdad (publicado en ${AGENDA_URL})

Solo puedes ofrecer esto, y nada mas:

- **Pagina web rapida, hecha para que le escriban**: diseno, los textos, y la medimos y
  mejoramos despues de publicarla. **Lista en 1 a 2 semanas.** Es lo que le sirve a casi todo
  negocio local: que lo encuentren, que confien y que le escriban.
- **Automatizacion de procesos**: lo repetitivo corriendo solo, conectado con WhatsApp,
  calendario o el SII, con un panel para mirarlo. **2 a 4 semanas.** Ofrecelo cuando el
  negocio pierde tiempo en tareas manuales (tomar horas, confirmar, cobrar).
- **Sistema a medida**: reservas, gestion interna o facturacion hechos para el negocio.
  **4 a 8 semanas.** Solo si lo que necesita no se resuelve con una pagina.
- **90 dias de mantencion sin costo** despues de entregar.
- **Garantia**: si no entregamos lo prometido, se devuelve el ultimo mes.

⛔ NO menciones precios. Si el dueno pregunta cuanto sale, eso se conversa en la llamada.
⛔ No prometas plazos, resultados ni cifras distintos de los de arriba.

## Reglas duras sobre los datos

- ⛔ NO INVENTES NADA. Solo puedes afirmar lo que esta en los datos de abajo. Si un dato no
  esta, ese angulo no existe: busca otro. Prohibido inventar cantidades de busquedas, clientes
  perdidos, competidores o cualquier numero que no te hayan dado.
- Las estrellas y resenas, si estan, son de Google Maps: es su reputacion ya ganada. Es el
  mejor angulo que tienes, porque es real y es suyo. Cita el numero tal cual, sin redondear.
- Si sabes la comuna, usala: muestra que no es un mensaje masivo. Nombrala en el punto 3,
  atada a como lo buscan ("cuando alguien busca <rubro> en <comuna>...").
- Largo: entre 60 y 125 palabras. Menos no alcanza para presentarse y ofrecer algo.

## Los datos de ESTE negocio (lo unico que puedes afirmar)

${datos}
${lead.info_texto && !reputacion ? `- Otra info del negocio: ${lead.info_texto.trim()}` : ""}
${sabemosDeSuWeb(lead) ? "" : "\n⚠️ NO SABEMOS si tiene sitio web. No menciones su web, ni Google, ni que no aparece: busca el gancho en su rubro, su comuna o su reputacion."}
${bloqueHistorial(historial)}

${customPrompt ? `\nInstrucciones adicionales del usuario (priorizalas): ${customPrompt}\n` : ""}
Devuelve un objeto JSON con ${disponibles.length === 1 ? "esta unica clave" : "estas claves"}:
${disponibles.includes("whatsapp") ? '- "whatsapp_text": el mensaje completo con las 5 partes, listo para enviar por WhatsApp.\n' : ""}${disponibles.includes("social") ? '- "social_text": el mensaje completo con las 5 partes, adaptado a un mensaje directo de red social.\n' : ""}
`.trim();

  let ia: DraftIA = {};
  // Pedir y leer son dos cosas distintas, y antes compartian un solo `catch`:
  // cualquier fallo de la llamada —incluida la cuota diaria agotada— se
  // reportaba como "la IA no devolvio un JSON valido". Ese mensaje manda a
  // buscar el problema al lugar equivocado; el 17-ago costo veinte minutos de
  // revisar la personalizacion cuando lo unico que pasaba era que se habia
  // acabado la cuota del dia.
  let respuesta: string;
  try {
    respuesta = await llm(prompt);
  } catch (err) {
    if (err instanceof CuotaAgotada) return { ...base, aviso: err.message };
    const detalle = err instanceof Error ? err.message : String(err);
    return { ...base, aviso: `No se pudo generar el mensaje: ${detalle.slice(0, 160)}` };
  }

  try {
    ia = JSON.parse(respuesta);
  } catch {
    return { ...base, aviso: "La IA respondió algo que no es JSON válido para este lead." };
  }

  const setDisp = new Set<Canal>(disponibles);

  const whatsappText = ia.whatsapp_text?.trim() || "";
  const whatsapp = setDisp.has("whatsapp")
    ? { text: whatsappText, link: construirLinkWhatsApp(lead.telefono, whatsappText) }
    : null;

  const social = setDisp.has("social") ? { text: ia.social_text?.trim() || "" } : null;

  return { ...base, whatsapp, social };
}
