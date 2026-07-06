-- Tabla de invitaciones de un solo uso
CREATE TABLE IF NOT EXISTS invitaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  invited_by_id UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida por token_hash
CREATE INDEX IF NOT EXISTS invitaciones_token_hash_idx ON invitaciones(token_hash);

-- Índice para rate limiting (búsqueda por invited_by_id + created_at)
CREATE INDEX IF NOT EXISTS invitaciones_rate_limit_idx ON invitaciones(invited_by_id, created_at);

-- RLS
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

-- Integrantes pueden ver las invitaciones que ellos generaron
CREATE POLICY "integrantes ven sus invitaciones"
  ON invitaciones FOR SELECT
  USING (
    invited_by_id = (
      SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()
    )
  );

-- Integrantes pueden crear invitaciones a su nombre
CREATE POLICY "integrantes crean invitaciones"
  ON invitaciones FOR INSERT
  WITH CHECK (
    invited_by_id = (
      SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()
    )
  );

-- Cualquiera puede marcar una invitación como usada (validación del token)
CREATE POLICY "marcar invitacion usada"
  ON invitaciones FOR UPDATE
  USING (used_at IS NULL AND expires_at > NOW())
  WITH CHECK (true);
