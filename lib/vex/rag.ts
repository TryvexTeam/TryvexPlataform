import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./embeddings";

/** Un fragmento de conocimiento recuperado del RAG. */
export type Chunk = {
  id: string;
  source: "hormozi" | "tryvex_doc" | "reunion";
  titulo: string | null;
  contenido: string;
  similitud: number;
};

export type EmbedFn = (texto: string, taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") => Promise<number[]>;

/**
 * Busca en la base de conocimiento (Hormozi + docs Tryvex + reuniones) los
 * fragmentos más parecidos a la consulta. Usa la función SQL buscar_conocimiento
 * (coseno, desempata por prioridad → conocimiento real de Tryvex sobre teoría).
 * `embedFn` se inyecta en los tests.
 */
export async function buscarConocimiento(
  sb: SupabaseClient,
  consulta: string,
  matchCount = 5,
  embedFn: EmbedFn = embed
): Promise<Chunk[]> {
  const query_embedding = await embedFn(consulta, "RETRIEVAL_QUERY");
  const { data, error } = await sb.rpc("buscar_conocimiento", {
    query_embedding,
    match_count: matchCount,
  });
  if (error) throw new Error(`buscar_conocimiento: ${error.message}`);
  return (data ?? []) as Chunk[];
}

/**
 * Arma el bloque de contexto para el prompt del bot a partir de los chunks.
 * Marca la fuente de cada uno (trazabilidad, guardarraíl acordado con Jarvis).
 * Devuelve "" si no hay chunks: el motor conversacional debe saber responder
 * sin contexto (o decir "lo confirmo con el equipo") en vez de inventar.
 */
export function componerContexto(chunks: Chunk[]): string {
  if (!chunks.length) return "";
  const etiqueta: Record<Chunk["source"], string> = {
    hormozi: "Hormozi",
    tryvex_doc: "Doc interno Tryvex",
    reunion: "Reunión",
  };
  return chunks
    .map((c, i) => {
      const fuente = etiqueta[c.source] ?? c.source;
      const titulo = c.titulo ? ` — ${c.titulo}` : "";
      return `[${i + 1}] (${fuente}${titulo})\n${c.contenido.trim()}`;
    })
    .join("\n\n");
}
