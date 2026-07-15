import { describe, it, expect } from "vitest";
import { buscarConocimiento, componerContexto, type Chunk } from "./rag";

// SupabaseClient falso: solo implementa rpc y devuelve lo que le pasemos.
function sbFake(respuesta: { data?: unknown; error?: { message: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const sb = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return respuesta;
    },
  };
  return { sb: sb as never, calls };
}

const embedFake = async () => Array(768).fill(0.1);

describe("buscarConocimiento", () => {
  it("embebe la consulta y llama buscar_conocimiento con el match_count", async () => {
    const chunks: Chunk[] = [
      { id: "1", source: "tryvex_doc", titulo: "Proceso de onboarding", contenido: "Paso 1...", similitud: 0.9 },
    ];
    const { sb, calls } = sbFake({ data: chunks, error: null });
    const out = await buscarConocimiento(sb, "cómo es el onboarding", 3, embedFake);

    expect(out).toEqual(chunks);
    expect(calls[0].fn).toBe("buscar_conocimiento");
    expect((calls[0].args as { match_count: number }).match_count).toBe(3);
    expect((calls[0].args as { query_embedding: number[] }).query_embedding).toHaveLength(768);
  });

  it("propaga el error del RPC", async () => {
    const { sb } = sbFake({ data: null, error: { message: "boom" } });
    await expect(buscarConocimiento(sb, "hola", 5, embedFake)).rejects.toThrow(/boom/);
  });

  it("devuelve [] si no hay data", async () => {
    const { sb } = sbFake({ data: null, error: null });
    expect(await buscarConocimiento(sb, "hola", 5, embedFake)).toEqual([]);
  });
});

describe("componerContexto", () => {
  it("devuelve vacío sin chunks (el bot no debe inventar)", () => {
    expect(componerContexto([])).toBe("");
  });

  it("etiqueta la fuente de cada chunk para trazabilidad", () => {
    const ctx = componerContexto([
      { id: "1", source: "hormozi", titulo: null, contenido: "Ofrece una oferta irresistible", similitud: 0.8 },
      { id: "2", source: "reunion", titulo: "Kickoff cliente X", contenido: "Acordamos landing", similitud: 0.7 },
    ]);
    expect(ctx).toContain("(Hormozi)");
    expect(ctx).toContain("(Reunión — Kickoff cliente X)");
    expect(ctx).toContain("Ofrece una oferta irresistible");
  });
});
