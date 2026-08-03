-- Control de asistencia estilo Buk: marcar entrada y salida, con pausas.
-- Cada integrante ve y marca lo suyo; el admin ve a todo el equipo.

-- ── Rol admin explícito (antes solo existía "integrante activo") ──
ALTER TABLE dim_integrantes ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE dim_integrantes
   SET es_admin = true
 WHERE lower(email) = 'ignacio.andres.navarrete.silva@gmail.com';

CREATE TABLE IF NOT EXISTS jornadas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  entrada_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  salida_at      TIMESTAMPTZ,
  -- [{ "inicio": "2026-08-03T18:00:00Z", "fin": "2026-08-03T18:30:00Z" }]
  pausas         JSONB NOT NULL DEFAULT '[]'::jsonb,
  nota           TEXT,
  origen         TEXT NOT NULL DEFAULT 'web' CHECK (origen IN ('web','pwa','movil','admin')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jornada_salida_posterior CHECK (salida_at IS NULL OR salida_at > entrada_at)
);

-- Una sola jornada abierta por persona: evita doble marcaje de entrada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jornada_abierta_unica
  ON jornadas (integrante_id) WHERE salida_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jornadas_integrante_entrada
  ON jornadas (integrante_id, entrada_at DESC);

CREATE INDEX IF NOT EXISTS idx_jornadas_entrada ON jornadas (entrada_at DESC);

CREATE OR REPLACE FUNCTION touch_jornada_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jornadas_updated_at ON jornadas;
CREATE TRIGGER trg_jornadas_updated_at
  BEFORE UPDATE ON jornadas
  FOR EACH ROW EXECUTE FUNCTION touch_jornada_updated_at();

ALTER TABLE jornadas ENABLE ROW LEVEL SECURITY;

-- Propias siempre; todas si es admin.
DROP POLICY IF EXISTS "leer jornadas propias o admin" ON jornadas;
CREATE POLICY "leer jornadas propias o admin"
  ON jornadas FOR SELECT TO authenticated
  USING (
    integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND es_admin = true)
  );

DROP POLICY IF EXISTS "marcar entrada propia" ON jornadas;
CREATE POLICY "marcar entrada propia"
  ON jornadas FOR INSERT TO authenticated
  WITH CHECK (
    integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "actualizar jornada propia o admin" ON jornadas;
CREATE POLICY "actualizar jornada propia o admin"
  ON jornadas FOR UPDATE TO authenticated
  USING (
    integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND es_admin = true)
  )
  WITH CHECK (
    integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND es_admin = true)
  );

GRANT SELECT, INSERT, UPDATE ON jornadas TO authenticated;

-- Resumen de horas por jornada, ya descontadas las pausas.
-- security_invoker: la vista respeta las policies de quien consulta, no las del dueño.
DROP VIEW IF EXISTS jornadas_resumen;
CREATE VIEW jornadas_resumen WITH (security_invoker = true) AS
SELECT
  j.id,
  j.integrante_id,
  i.nombre AS integrante_nombre,
  i.email  AS integrante_email,
  j.entrada_at,
  j.salida_at,
  j.nota,
  j.origen,
  (j.entrada_at AT TIME ZONE 'America/Santiago')::date AS fecha_local,
  GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(j.salida_at, NOW()) - j.entrada_at))
    - COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM ((p->>'fin')::timestamptz - (p->>'inicio')::timestamptz)))
        FROM jsonb_array_elements(j.pausas) p
        WHERE p ? 'fin'
      ), 0),
    0
  )::numeric / 3600 AS horas
FROM jornadas j
JOIN dim_integrantes i ON i.id = j.integrante_id;

GRANT SELECT ON jornadas_resumen TO authenticated;
