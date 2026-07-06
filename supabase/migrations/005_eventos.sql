-- Eventos puntuales del calendario del equipo (capa sobre disponibilidad recurrente)

CREATE TABLE IF NOT EXISTS eventos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'interno'
              CHECK (tipo IN ('reunion_lead','interno','entrega','otro')),
  inicio      TIMESTAMPTZ NOT NULL,
  fin         TIMESTAMPTZ NOT NULL,
  lead_id     UUID REFERENCES fact_leads(id) ON DELETE SET NULL,
  cliente_id  UUID REFERENCES dim_clientes(id) ON DELETE SET NULL,
  creado_por  UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fin > inicio)
);

CREATE TABLE IF NOT EXISTS eventos_asistentes (
  evento_id      UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  PRIMARY KEY (evento_id, integrante_id)
);

CREATE INDEX IF NOT EXISTS eventos_inicio_idx ON eventos(inicio);

ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_asistentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrantes leen eventos" ON eventos;
CREATE POLICY "integrantes leen eventos"
  ON eventos FOR SELECT TO authenticated USING (is_integrante());

DROP POLICY IF EXISTS "integrantes crean eventos" ON eventos;
CREATE POLICY "integrantes crean eventos"
  ON eventos FOR INSERT TO authenticated
  WITH CHECK (
    creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "creador edita evento" ON eventos;
CREATE POLICY "creador edita evento"
  ON eventos FOR UPDATE TO authenticated
  USING (creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "creador borra evento" ON eventos;
CREATE POLICY "creador borra evento"
  ON eventos FOR DELETE TO authenticated
  USING (creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "integrantes leen asistentes" ON eventos_asistentes;
CREATE POLICY "integrantes leen asistentes"
  ON eventos_asistentes FOR SELECT TO authenticated USING (is_integrante());

DROP POLICY IF EXISTS "creador gestiona asistentes" ON eventos_asistentes;
CREATE POLICY "creador gestiona asistentes"
  ON eventos_asistentes FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM eventos e WHERE e.id = evento_id
            AND e.creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM eventos e WHERE e.id = evento_id
            AND e.creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()))
  );
