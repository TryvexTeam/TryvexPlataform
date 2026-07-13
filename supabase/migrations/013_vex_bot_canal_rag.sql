-- 013: Bot de Tryvex — canal WhatsApp (hilo fino) + RAG (base de conocimiento)
-- Diseñado con Jarvis (13-jul). Reusa fact_leads/dim_clientes/dim_proyectos/actividad;
-- solo agrega 2 tablas. Idempotente. NO aplicar sin revisión previa.

-- ============================================================================
-- (a) mensajes_wa — historial completo del canal WhatsApp por lead
--     Complementa interacciones_lead (log grueso) con el hilo fino que el bot necesita.
-- ============================================================================
CREATE TABLE IF NOT EXISTS mensajes_wa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID REFERENCES fact_leads(id) ON DELETE CASCADE,
  cliente_id     UUID REFERENCES dim_clientes(id) ON DELETE CASCADE,
  direccion      TEXT NOT NULL CHECK (direccion IN ('in','out')),
  texto          TEXT NOT NULL,
  wa_message_id  TEXT,
  chip_id        TEXT,                         -- qué número (chip) envió/recibió
  es_bot         BOOLEAN NOT NULL DEFAULT FALSE, -- true si lo generó el bot (out)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Debe colgar de un lead O de un cliente (al menos uno)
ALTER TABLE mensajes_wa DROP CONSTRAINT IF EXISTS chk_mensajes_wa_dueno;
ALTER TABLE mensajes_wa ADD CONSTRAINT chk_mensajes_wa_dueno
  CHECK (lead_id IS NOT NULL OR cliente_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mensajes_wa_lead ON mensajes_wa(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mensajes_wa_cliente ON mensajes_wa(cliente_id, created_at);
-- Anti-duplicado de mensajes entrantes (mismo id de WhatsApp)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensajes_wa_waid
  ON mensajes_wa(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- ============================================================================
-- (b) knowledge_chunks — base vectorial del RAG (Hormozi + docs Tryvex + reuniones)
--     Requiere la extensión pgvector.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL CHECK (source IN ('hormozi','tryvex_doc','reunion')),
  referencia_id  UUID,                         -- id de cerebro_docs o reuniones si aplica
  titulo         TEXT,
  contenido      TEXT NOT NULL,
  embedding      VECTOR(768),                  -- Gemini text-embedding-004 = 768 dims
  prioridad      INT NOT NULL DEFAULT 0,       -- tryvex_doc/reunion > hormozi al desempatar
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Índice de similitud coseno (ivfflat; se puede reindexar a hnsw con más volumen)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_chunks(source);

-- ============================================================================
-- RLS + grants (mismo patrón que la 012: equipo lee, el server escribe)
-- ============================================================================
ALTER TABLE mensajes_wa ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mensajes_wa_select ON mensajes_wa;
CREATE POLICY mensajes_wa_select ON mensajes_wa FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS knowledge_select ON knowledge_chunks;
CREATE POLICY knowledge_select ON knowledge_chunks FOR SELECT TO authenticated USING (true);

GRANT SELECT ON mensajes_wa, knowledge_chunks TO authenticated;
GRANT ALL ON mensajes_wa, knowledge_chunks TO service_role;

-- ============================================================================
-- Función de búsqueda semántica para el RAG (desempata por prioridad)
-- ============================================================================
CREATE OR REPLACE FUNCTION buscar_conocimiento(
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5
)
RETURNS TABLE (id UUID, source TEXT, titulo TEXT, contenido TEXT, similitud FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT id, source, titulo, contenido,
         1 - (embedding <=> query_embedding) AS similitud
  FROM knowledge_chunks
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding, prioridad DESC
  LIMIT match_count;
$$;
