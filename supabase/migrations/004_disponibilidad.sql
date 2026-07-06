-- Disponibilidad recurrente semanal por integrante (celdas de 1 hora)
-- dia_semana: 0=lunes ... 6=domingo · hora: 0-23 (America/Santiago implícito)

CREATE TABLE IF NOT EXISTS disponibilidad (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  dia_semana     SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora           SMALLINT NOT NULL CHECK (hora BETWEEN 0 AND 23),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integrante_id, dia_semana, hora)
);

CREATE INDEX IF NOT EXISTS disponibilidad_integrante_idx ON disponibilidad(integrante_id);

ALTER TABLE disponibilidad ENABLE ROW LEVEL SECURITY;

-- Todos los integrantes activos ven la disponibilidad de todos
DROP POLICY IF EXISTS "integrantes leen disponibilidad" ON disponibilidad;
CREATE POLICY "integrantes leen disponibilidad"
  ON disponibilidad FOR SELECT TO authenticated
  USING (is_integrante());

-- Cada integrante escribe SOLO la suya
DROP POLICY IF EXISTS "integrante escribe su disponibilidad" ON disponibilidad;
CREATE POLICY "integrante escribe su disponibilidad"
  ON disponibilidad FOR INSERT TO authenticated
  WITH CHECK (
    integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "integrante borra su disponibilidad" ON disponibilidad;
CREATE POLICY "integrante borra su disponibilidad"
  ON disponibilidad FOR DELETE TO authenticated
  USING (
    integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
  );
