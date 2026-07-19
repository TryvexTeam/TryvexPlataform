-- 016: scraper_runs — telemetría de las corridas del scraper de leads.
-- El scraper (scraper/) registra acá cada corrida (cuándo, cuánto trajo). El
-- dashboard de control en el CRM la lee para mostrar el historial. Sin esta
-- tabla el scraper igual funciona (escribe los leads), solo pierde el registro.
-- Mismo patrón que la 012/013: el equipo autenticado LEE, el server (service_role) ESCRIBE.

CREATE TABLE IF NOT EXISTS scraper_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duracion_min      NUMERIC,
  nuevos_leads      INTEGER NOT NULL DEFAULT 0,
  actualizados      INTEGER NOT NULL DEFAULT 0,
  descartados       INTEGER NOT NULL DEFAULT 0,
  total_procesados  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_fecha ON scraper_runs(fecha DESC);

ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scraper_runs_select ON scraper_runs;
CREATE POLICY scraper_runs_select ON scraper_runs FOR SELECT TO authenticated USING (true);

GRANT SELECT ON scraper_runs TO authenticated;
GRANT ALL ON scraper_runs TO service_role;
