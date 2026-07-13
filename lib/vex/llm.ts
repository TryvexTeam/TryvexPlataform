import Groq from "groq-sdk";

// Cliente perezoso: NO se instancia al cargar el módulo (el SDK tira error si
// la key no está, y eso rompía el build de Vercel al "recolectar page data").
// Se crea recién en la 1ª llamada, cuando la key ya está en el entorno.
let _groq: Groq | null = null;
function groq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

/** Modelo del agente Vex en Groq. Free tier amplio y rápido. */
export const MODELO = process.env.VEX_MODEL || "llama-3.3-70b-versatile";

export async function conReintento<T>(
  fn: () => Promise<T>,
  intentos = 3,
  sleepMs?: (n: number) => Promise<void>
): Promise<T> {
  let ultimo: unknown;
  const sleep = sleepMs || ((n: number) => new Promise((r) => setTimeout(r, 1200 * n)));

  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const reintentable = ["503", "unavailable", "overloaded", "high demand", "429", "rate", "timeout"].some((k) => msg.includes(k));
      if (!reintentable || i === intentos - 1) throw e;
      await sleep(i + 1);
    }
  }
  throw ultimo;
}

/**
 * Pide a la IA una respuesta en JSON. El prompt debe describir las claves esperadas.
 * Devuelve el string JSON (el caller hace JSON.parse).
 */
export async function llmJSON(prompt: string): Promise<string> {
  const r = await conReintento(() =>
    groq().chat.completions.create({
      model: MODELO,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
    })
  );
  return r.choices[0]?.message?.content || "{}";
}

/** Pide a la IA una respuesta en texto plano (conversacional). */
export async function llmTexto(prompt: string): Promise<string> {
  const r = await conReintento(() =>
    groq().chat.completions.create({
      model: MODELO,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    })
  );
  return r.choices[0]?.message?.content || "";
}
