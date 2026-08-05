-- Reacciones con emoji y mensajes fijados.
--
-- Dos cosas que en un chat de equipo hacen el mismo trabajo: sacar ruido del hilo.
-- Un pulgar arriba evita cinco mensajes de "dale"; un mensaje fijado evita repetir
-- el link del deploy cada vez que alguien entra.

-- ══ 1 · Reacciones ═══════════════════════════════════════════════════════════
-- Una fila por (mensaje, quién, emoji). El agrupado para mostrar "👍 3" se hace al
-- leer: guardar el contador acá obligaría a mantenerlo sincronizado y se desincroniza
-- siempre.
--
-- Quién reacciona sigue la misma regla que quién escribe (024): o una persona o un
-- agente, nunca ambos ni ninguno.
CREATE TABLE IF NOT EXISTS mensaje_reacciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id     UUID NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  integrante_id  UUID REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  agente_id      UUID REFERENCES agentes(id) ON DELETE CASCADE,
  emoji          TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reaccion_tiene_un_autor
    CHECK ((integrante_id IS NOT NULL) <> (agente_id IS NOT NULL))
);

-- La misma persona no puede poner dos veces el mismo emoji en el mismo mensaje.
-- Son dos índices y no uno porque una de las dos columnas siempre va NULL, y en un
-- índice único los NULL no colisionan entre sí: (msg, NULL, '👍') se repetiría.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reaccion_persona
  ON mensaje_reacciones (mensaje_id, integrante_id, emoji)
  WHERE integrante_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reaccion_agente
  ON mensaje_reacciones (mensaje_id, agente_id, emoji)
  WHERE agente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reacciones_mensaje ON mensaje_reacciones (mensaje_id);

ALTER TABLE mensaje_reacciones ENABLE ROW LEVEL SECURITY;

-- Se ven y se ponen dentro de las conversaciones donde uno está. El salto de
-- mensaje_id a conversacion_id se hace acá y no en el cliente: si dependiera de lo
-- que manda el front, cualquiera podría reaccionar en un DM ajeno.
DROP POLICY IF EXISTS "ver reacciones de mis conversaciones" ON mensaje_reacciones;
CREATE POLICY "ver reacciones de mis conversaciones"
  ON mensaje_reacciones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM mensajes m WHERE m.id = mensaje_id AND es_miembro_conversacion(m.conversacion_id)));

DROP POLICY IF EXISTS "reaccionar en mis conversaciones" ON mensaje_reacciones;
CREATE POLICY "reaccionar en mis conversaciones"
  ON mensaje_reacciones FOR INSERT TO authenticated
  WITH CHECK (
    integrante_id = mi_integrante_id()
    AND EXISTS (SELECT 1 FROM mensajes m WHERE m.id = mensaje_id AND es_miembro_conversacion(m.conversacion_id))
  );

-- Solo se quita la propia. Sacar la reacción de otro sería reescribir lo que dijo.
DROP POLICY IF EXISTS "quitar mi reaccion" ON mensaje_reacciones;
CREATE POLICY "quitar mi reaccion"
  ON mensaje_reacciones FOR DELETE TO authenticated
  USING (integrante_id = mi_integrante_id());

GRANT SELECT, INSERT, DELETE ON mensaje_reacciones TO authenticated;
GRANT ALL ON mensaje_reacciones TO service_role;

-- ══ 2 · Mensajes fijados ═════════════════════════════════════════════════════
-- Columnas en `mensajes` y no una tabla aparte: un mensaje está fijado o no, no hay
-- estado propio que guardar. `fijado_por` deja saber quién lo fijó, que en un equipo
-- importa tanto como el qué.
ALTER TABLE mensajes
  ADD COLUMN IF NOT EXISTS fijado_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fijado_por UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL;

-- Índice parcial: los fijados son un puñado entre miles. Se ordena por fijado_at DESC
-- porque la barra de fijados muestra lo último primero.
CREATE INDEX IF NOT EXISTS idx_mensajes_fijados
  ON mensajes (conversacion_id, fijado_at DESC)
  WHERE fijado_at IS NOT NULL;

COMMENT ON COLUMN mensajes.fijado_at IS
  'Cuándo se fijó. NULL = no fijado. Fijar es de la conversación, no de quien mira.';

-- ── Quién puede fijar ────────────────────────────────────────────────────────
-- La policy de UPDATE de mensajes (019) permite editar el propio. Fijar es distinto:
-- es un acto sobre la conversación, así que puede hacerlo cualquier miembro, incluso
-- sobre un mensaje ajeno — igual que en Slack.
--
-- RLS no distingue columnas, así que no se puede escribir "puede tocar fijado_at pero
-- no contenido" con una policy. El trigger sí: deja pasar el cambio de fijado si quien
-- lo hace es miembro, y no toca el resto de las reglas.
CREATE OR REPLACE FUNCTION guardar_fijado_mensaje()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.fijado_at IS DISTINCT FROM OLD.fijado_at THEN
    -- service_role (rutas de servidor) no pasa por auth.uid().
    IF auth.uid() IS NOT NULL AND NOT es_miembro_conversacion(NEW.conversacion_id) THEN
      RAISE EXCEPTION 'solo_miembros_fijan' USING ERRCODE = '42501';
    END IF;

    -- Coherencia: si se fija, queda registrado quién; si se suelta, se limpia.
    IF NEW.fijado_at IS NOT NULL AND NEW.fijado_por IS NULL THEN
      NEW.fijado_por := mi_integrante_id();
    ELSIF NEW.fijado_at IS NULL THEN
      NEW.fijado_por := NULL;
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_guardar_fijado ON mensajes;
CREATE TRIGGER trg_guardar_fijado
  BEFORE UPDATE ON mensajes
  FOR EACH ROW EXECUTE FUNCTION guardar_fijado_mensaje();

-- ── En vivo ──────────────────────────────────────────────────────────────────
-- Una reacción que aparece recién al recargar no se siente como una reacción.
-- `mensajes` ya está publicada desde la 023, así que fijar viaja solo.
-- Se agrega dentro de un DO porque incluir una tabla ya publicada aborta el ALTER
-- con 42710 y revierte todo lo demás — ya pasó con `notificaciones`.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'mensaje_reacciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensaje_reacciones;
  END IF;
END $pub$;

ALTER TABLE mensaje_reacciones REPLICA IDENTITY FULL;
