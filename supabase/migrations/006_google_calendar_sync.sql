-- PRP-007: Google Calendar → CRM sync
-- Idempotencia del sync + estado del canal watch

ALTER TABLE eventos
  ADD COLUMN google_event_id TEXT UNIQUE,
  ADD COLUMN origen TEXT NOT NULL DEFAULT 'crm' CHECK (origen IN ('crm', 'google'));

-- Estado del sync por calendario (fila única por calendar_id)
CREATE TABLE google_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id TEXT NOT NULL UNIQUE,
  sync_token TEXT,
  channel_id TEXT,
  resource_id TEXT,
  channel_expiration TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solo service role opera esta tabla (webhook/cron); sin policies para authenticated
ALTER TABLE google_sync_state ENABLE ROW LEVEL SECURITY;
