-- Preferencias personales y marca de reenvío para el chat estilo WhatsApp.
-- Aditiva e idempotente: puede ejecutarse de nuevo sin perder datos.

ALTER TABLE public.conversacion_miembros
  ADD COLUMN IF NOT EXISTS fijado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS silenciado_hasta TIMESTAMPTZ;

ALTER TABLE public.mensajes
  ADD COLUMN IF NOT EXISTS reenviado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_fijados_personales
  ON public.conversacion_miembros (integrante_id, fijado_at DESC)
  WHERE fijado_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_archivados_personales
  ON public.conversacion_miembros (integrante_id, archivado_at DESC)
  WHERE archivado_at IS NOT NULL;

COMMENT ON COLUMN public.conversacion_miembros.fijado_at IS
  'Preferencia del miembro. NULL = no fijada; máximo tres, validado por la API.';
COMMENT ON COLUMN public.conversacion_miembros.archivado_at IS
  'Preferencia del miembro. NULL = conversación visible en la bandeja principal.';
COMMENT ON COLUMN public.conversacion_miembros.silenciado_hasta IS
  'Preferencia del miembro. NULL = con notificaciones; infinity = siempre silenciada.';
COMMENT ON COLUMN public.mensajes.reenviado IS
  'TRUE cuando el mensaje es una copia independiente reenviada desde otra conversación.';

-- Verificado en 019_chat_interno.sql: esta policy permite UPDATE únicamente en
-- la fila del integrante autenticado. Se recrea para instalaciones con drift.
DROP POLICY IF EXISTS "marcar lectura propia" ON public.conversacion_miembros;
CREATE POLICY "marcar lectura propia"
  ON public.conversacion_miembros FOR UPDATE TO authenticated
  USING (integrante_id = public.mi_integrante_id())
  WITH CHECK (integrante_id = public.mi_integrante_id());
