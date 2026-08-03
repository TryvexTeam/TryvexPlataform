-- Web Push (VAPID): suscripciones de navegador por integrante.
-- Un integrante puede tener varias (PC, celular, PWA instalada).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subs_integrante ON push_subscriptions (integrante_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leer propias suscripciones push" ON push_subscriptions;
CREATE POLICY "leer propias suscripciones push"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "crear propia suscripcion push" ON push_subscriptions;
CREATE POLICY "crear propia suscripcion push"
  ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

-- El upsert por endpoint (mismo navegador que renueva su suscripción) necesita UPDATE.
DROP POLICY IF EXISTS "actualizar propia suscripcion push" ON push_subscriptions;
CREATE POLICY "actualizar propia suscripcion push"
  ON push_subscriptions FOR UPDATE TO authenticated
  USING (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()))
  WITH CHECK (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "borrar propia suscripcion push" ON push_subscriptions;
CREATE POLICY "borrar propia suscripcion push"
  ON push_subscriptions FOR DELETE TO authenticated
  USING (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

-- RLS sin GRANT = error 42501: Postgres evalúa privilegios ANTES que las policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
