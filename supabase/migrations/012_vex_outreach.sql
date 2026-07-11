-- 012: Vex (scraper-clientes) — registro de outreach + historial de chat
CREATE TABLE IF NOT EXISTS outreach_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES fact_leads(id) ON DELETE CASCADE,
  canal          TEXT NOT NULL CHECK (canal IN ('whatsapp','email','social')),
  texto          TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviado','fallido')),
  aprobado_por   UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  wa_message_id  TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_messages(lead_id);
-- Idempotencia del primer contacto: un solo "enviado" por lead+canal
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_enviado
  ON outreach_messages(lead_id, canal) WHERE estado = 'enviado';

CREATE TABLE IF NOT EXISTS vex_conversaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  rol            TEXT NOT NULL CHECK (rol IN ('user','vex')),
  texto          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vexconv_integrante ON vex_conversaciones(integrante_id, created_at);

ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE vex_conversaciones ENABLE ROW LEVEL SECURITY;

-- Equipo autenticado lee outreach; escribe el server (service role bypasea RLS)
CREATE POLICY outreach_select ON outreach_messages FOR SELECT TO authenticated USING (true);
-- Cada integrante ve solo su conversación con Vex
CREATE POLICY vexconv_select ON vex_conversaciones FOR SELECT TO authenticated
  USING (integrante_id IN (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));
GRANT SELECT ON outreach_messages, vex_conversaciones TO authenticated;
GRANT ALL ON outreach_messages, vex_conversaciones TO service_role;
