import { conReintento } from "./llm";

/** Modelo de embeddings de Gemini. Free tier, 768 dimensiones. */
export const EMBED_MODEL = process.env.VEX_EMBED_MODEL || "text-embedding-004";
export const EMBED_DIM = 768;

const ENDPOINT = (modelo: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:embedContent`;

type FetchLike = typeof fetch;

/**
 * Convierte un texto en su vector de embedding (768 dims) con Gemini.
 * `fetchImpl` se inyecta en los tests para no pegar a la red.
 * `taskType` = RETRIEVAL_DOCUMENT al indexar, RETRIEVAL_QUERY al consultar
 * (mejora la calidad del match, es la recomendación de Google).
 */
export async function embed(
  texto: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_QUERY",
  fetchImpl: FetchLike = fetch
): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Falta GEMINI_API_KEY para generar embeddings");
  const limpio = texto.trim();
  if (!limpio) throw new Error("No se puede embedear texto vacío");

  const vector = await conReintento(async () => {
    const r = await fetchImpl(`${ENDPOINT(EMBED_MODEL)}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: limpio }] },
        taskType,
      }),
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => "");
      // 429/503 los reintenta conReintento; otros cortan.
      throw new Error(`Embedding ${r.status}: ${detalle.slice(0, 200)}`);
    }
    const json = (await r.json()) as { embedding?: { values?: number[] } };
    return json.embedding?.values ?? null;
  });

  if (!vector || vector.length !== EMBED_DIM) {
    throw new Error(`Embedding inválido: se esperaban ${EMBED_DIM} dims, llegaron ${vector?.length ?? 0}`);
  }
  return vector;
}
