import { z } from "zod";
import { ESTADOS_LEAD } from "./cartera";
import { llmJSON } from "./llm";

export type Turno = { rol: "user" | "vex"; texto: string };

export type Accion =
  | { tipo: "reporte" }
  | { tipo: "recomendar"; nicho?: string; localidad?: string; cantidad?: number }
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

function construirPrompt(mensaje: string, historial: Turno[]): string {
  const contexto = historial
    .slice(-20)
    .map((t) => `${t.rol === "user" ? "Usuario" : "Vex"}: ${t.texto}`)
    .join("\n");

  return `
Eres el clasificador de intenciones de Vex, el agente de outreach de Tryvex.
Según la conversación, decide la(s) ACCIÓN(es) que pide el usuario en su último mensaje.

Acciones posibles (campo "tipo"):
- reporte: resumen de la cartera de leads (cuántos por estado).
- recomendar: sugerir leads para contactar. Parámetros opcionales: nicho, localidad, cantidad.
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
    const parsed = AccionSchema.safeParse(a);
    if (parsed.success) validas.push(parsed.data);
    if (validas.length >= TOPE_ACCIONES) break;
  }

  return validas.length ? validas : [{ tipo: "conversar" }];
}
