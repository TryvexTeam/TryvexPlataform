-- FASE B: Motor de notificaciones in-app (campanita + Realtime)
CREATE TABLE IF NOT EXISTS notificaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN (
                   'nuevo_cliente','proyecto_asignado','entrega_proxima',
                   'cobro_proximo','tarea_asignada','cita_invitado')),
  titulo         TEXT NOT NULL,
  cuerpo         TEXT,
  link           TEXT,
  leida          BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_integrante_leida
  ON notificaciones (integrante_id, leida, created_at DESC);

-- Evita duplicados del cron diario (mismo aviso, mismo día).
-- AT TIME ZONE 'UTC' hace la expresión IMMUTABLE (cast directo ::date no lo es).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedupe
  ON notificaciones (integrante_id, tipo, titulo, (((created_at AT TIME ZONE 'UTC')::date)));

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leer propias notificaciones" ON notificaciones;
CREATE POLICY "leer propias notificaciones"
  ON notificaciones FOR SELECT TO authenticated
  USING (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "marcar propias leidas" ON notificaciones;
CREATE POLICY "marcar propias leidas"
  ON notificaciones FOR UPDATE TO authenticated
  USING (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()))
  WITH CHECK (integrante_id = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));

-- Los integrantes pueden generar notificaciones para el equipo (emisores de la app)
DROP POLICY IF EXISTS "insertar notificaciones" ON notificaciones;
CREATE POLICY "insertar notificaciones"
  ON notificaciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true));

-- Realtime para la campanita
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
