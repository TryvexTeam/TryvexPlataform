import { z } from "zod";
import { ESTADOS_LEAD } from "./cartera";
import { llmJSON } from "./llm";

export type Turno = { rol: "user" | "vex"; texto: string };

export type Accion =
  | { tipo: "reporte" }
  | {
      tipo: "recomendar";
      nicho?: string;
      localidad?: string;
      cantidad?: number;
      estado?: (typeof ESTADOS_LEAD)[number];
    }
  | { tipo: "marcar"; nombres: string[]; estado: (typeof ESTADOS_LEAD)[number] }
  | {
      tipo: "preparar_envio";
      nicho?: string;
      localidad?: string;
      cantidad?: number;
      instrucciones?: string;
    }
  | { tipo: "conversar" };

const AccionSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("reporte") }),
  z.object({
    tipo: z.literal("recomendar"),
    nicho: z.string().optional(),
    localidad: z.string().optional(),
    cantidad: z.number().optional(),
    estado: z.enum(ESTADOS_LEAD).optional(),
  }),
  z.object({
    tipo: z.literal("marcar"),
    nombres: z.array(z.string()).min(1),
    estado: z.enum(ESTADOS_LEAD),
  }),
  z.object({
    tipo: z.literal("preparar_envio"),
    nicho: z.string().optional(),
    localidad: z.string().optional(),
    cantidad: z.number().optional(),
    instrucciones: z.string().optional(),
  }),
  z.object({ tipo: z.literal("conversar") }),
]);

const TOPE_ACCIONES = 5;

/**
 * Quita las claves con valor null/undefined de un objeto (superficial).
 * Groq (llama) devuelve `null` para los parámetros no especificados
 * (ej. {"tipo":"recomendar","nicho":"gimnasios","localidad":null,"cantidad":null}),
 * pero el schema usa `.optional()` que acepta `undefined`, NO `null` → rechazaba
 * TODA acción con parámetros opcionales y caía a `conversar` (bug del 17-jul:
 * "Vex responde siempre lo mismo"). Al sacar los null, el opcional queda ausente
 * y valida bien, sin que el código de abajo tenga que lidiar con null.
 */
function sinNulls(o: unknown): unknown {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    return Object.fromEntries(
      Object.entries(o as Record<string, unknown>).filter(
        ([, v]) => v !== null && v !== undefined
      )
    );
  }
  return o;
}

function construirPrompt(mensaje: string, historial: Turno[]): string {
  const contexto = historial
    .slice(-20)
    .map((t) => `${t.rol === "user" ? "Usuario" : "Vex"}: ${t.texto}`)
    .join("\n");

  return `
Eres el clasificador de intenciones de Vex, el agente de outreach de Tryvex.
Según la conversación, decide la(s) ACCIÓN(es) que pide el usuario en su último mensaje.

Acciones posibles (campo "tipo"):
- reporte: resumen NUMÉRICO de la cartera (cuántos leads hay por estado). Usar solo cuando
  piden totales/cuántos, NO cuando piden nombres.
- recomendar: LISTAR leads con sus nombres. Parámetros opcionales: nicho, localidad, cantidad,
  estado (uno de: ${ESTADOS_LEAD.join(", ")}). Usar SIEMPRE que el usuario quiera VER o saber
  QUIÉNES / CUÁLES son los leads. Ejemplos: "mostrame los gimnasios" → {nicho:"gimnasios"};
  "quiénes son los contactados" / "cuáles contactamos" → {estado:"contactado"}; "los interesados"
  → {estado:"interesado"}. Sin estado, lista los sin_contactar (a quién conviene contactar).
- marcar: cambiar el estado de uno o varios leads por nombre. Requiere "nombres" (array de
  strings con el/los nombres de negocio) y "estado" destino (uno de: ${ESTADOS_LEAD.join(", ")}).
- preparar_envio: generar borradores de mensajes para enviar. Parámetros opcionales: nicho,
  localidad, cantidad, instrucciones (indicaciones extra de redacción del usuario).
- conversar: saludo, charla general o cualquier cosa que no encaje en las anteriores.

Conversación reciente:
${contexto || "(sin historial)"}

Último mensaje del usuario: "${mensaje}"

Si el mensaje pide varias cosas a la vez, devolvé UNA entrada por cada una, en orden.

Devuelve SOLO un objeto JSON con esta forma:
{"acciones": [ {"tipo": string, ...parámetros} ] }
`.trim();
}

/**
 * Clasifica el mensaje del usuario en una lista de acciones (tope 5).
 * Descarta acciones con tipo desconocido o inválidas según su schema;
 * si no queda ninguna acción válida, cae a [{ tipo: 'conversar' }].
 */
export async function clasificarIntencion(
  mensaje: string,
  historial: Turno[] = [],
  llm: (prompt: string) => Promise<string> = llmJSON
): Promise<Accion[]> {
  const prompt = construirPrompt(mensaje, historial);

  let crudo: unknown;
  try {
    crudo = JSON.parse(await llm(prompt));
  } catch {
    return [{ tipo: "conversar" }];
  }

  const acciones = (crudo as { acciones?: unknown })?.acciones;
  if (!Array.isArray(acciones)) return [{ tipo: "conversar" }];

  const validas: Accion[] = [];
  for (const a of acciones) {
    const parsed = AccionSchema.safeParse(sinNulls(a));
    if (parsed.success) validas.push(parsed.data);
    if (validas.length >= TOPE_ACCIONES) break;
  }

  return validas.length ? validas : [{ tipo: "conversar" }];
}
