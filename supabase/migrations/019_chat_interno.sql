-- Chat interno del equipo: grupos y mensajes directos, con lecturas por persona.
-- La presencia (quién está conectado) NO vive acá: va por Realtime Presence, en memoria.

CREATE TABLE IF NOT EXISTS conversaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           TEXT NOT NULL CHECK (tipo IN ('dm','grupo')),
  nombre         TEXT,
  -- Par ordenado de UUIDs para los DM: impide dos hilos entre las mismas personas.
  dm_key         TEXT UNIQUE,
  creada_por     UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_mensaje_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grupo_con_nombre CHECK (tipo = 'dm' OR nombre IS NOT NULL),
  CONSTRAINT dm_con_key       CHECK (tipo = 'grupo' OR dm_key IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS conversacion_miembros (
  conversacion_id  UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  integrante_id    UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  ultimo_leido_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversacion_id, integrante_id)
);

CREATE INDEX IF NOT EXISTS idx_miembros_integrante ON conversacion_miembros (integrante_id);

CREATE TABLE IF NOT EXISTS mensajes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id  UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor_id         UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  contenido        TEXT NOT NULL CHECK (length(trim(contenido)) > 0),
  editado_at       TIMESTAMPTZ,
  eliminado_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion
  ON mensajes (conversacion_id, created_at DESC);

-- ── Pertenencia ───────────────────────────────────────────────────────────
-- SECURITY DEFINER a propósito: si la policy de conversaciones consultara
-- conversacion_miembros directamente (y viceversa), Postgres entraría en
-- recursión infinita entre ambas policies.
CREATE OR REPLACE FUNCTION es_miembro_conversacion(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversacion_miembros m
    JOIN dim_integrantes i ON i.id = m.integrante_id
    WHERE m.conversacion_id = conv_id
      AND i.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION mi_integrante_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION es_miembro_conversacion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION mi_integrante_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION es_miembro_conversacion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mi_integrante_id() TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE conversaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversacion_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver mis conversaciones" ON conversaciones;
CREATE POLICY "ver mis conversaciones"
  ON conversaciones FOR SELECT TO authenticated
  USING (es_miembro_conversacion(id));

-- Cualquier integrante activo puede abrir un hilo; se vuelve miembro en el paso siguiente.
DROP POLICY IF EXISTS "crear conversacion" ON conversaciones;
CREATE POLICY "crear conversacion"
  ON conversaciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true
  ));

DROP POLICY IF EXISTS "tocar conversacion propia" ON conversaciones;
CREATE POLICY "tocar conversacion propia"
  ON conversaciones FOR UPDATE TO authenticated
  USING (es_miembro_conversacion(id))
  WITH CHECK (es_miembro_conversacion(id));

DROP POLICY IF EXISTS "ver miembros de mis conversaciones" ON conversacion_miembros;
CREATE POLICY "ver miembros de mis conversaciones"
  ON conversacion_miembros FOR SELECT TO authenticated
  USING (es_miembro_conversacion(conversacion_id));

-- Sumar gente: uno mismo siempre; a otros, solo si ya se es miembro del hilo.
DROP POLICY IF EXISTS "sumar miembros" ON conversacion_miembros;
CREATE POLICY "sumar miembros"
  ON conversacion_miembros FOR INSERT TO authenticated
  WITH CHECK (integrante_id = mi_integrante_id() OR es_miembro_conversacion(conversacion_id));

-- Solo la marca de lectura propia.
DROP POLICY IF EXISTS "marcar lectura propia" ON conversacion_miembros;
CREATE POLICY "marcar lectura propia"
  ON conversacion_miembros FOR UPDATE TO authenticated
  USING (integrante_id = mi_integrante_id())
  WITH CHECK (integrante_id = mi_integrante_id());

DROP POLICY IF EXISTS "salir de la conversacion" ON conversacion_miembros;
CREATE POLICY "salir de la conversacion"
  ON conversacion_miembros FOR DELETE TO authenticated
  USING (integrante_id = mi_integrante_id());

DROP POLICY IF EXISTS "leer mensajes de mis conversaciones" ON mensajes;
CREATE POLICY "leer mensajes de mis conversaciones"
  ON mensajes FOR SELECT TO authenticated
  USING (es_miembro_conversacion(conversacion_id));

DROP POLICY IF EXISTS "escribir en mis conversaciones" ON mensajes;
CREATE POLICY "escribir en mis conversaciones"
  ON mensajes FOR INSERT TO authenticated
  WITH CHECK (autor_id = mi_integrante_id() AND es_miembro_conversacion(conversacion_id));

-- Editar o borrar: solo lo propio.
DROP POLICY IF EXISTS "editar mensaje propio" ON mensajes;
CREATE POLICY "editar mensaje propio"
  ON mensajes FOR UPDATE TO authenticated
  USING (autor_id = mi_integrante_id())
  WITH CHECK (autor_id = mi_integrante_id());

-- RLS sin GRANT = 42501: Postgres evalúa privilegios ANTES que las policies.
GRANT SELECT, INSERT, UPDATE ON conversaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversacion_miembros TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mensajes TO authenticated;

-- ── Orden de la bandeja ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_conversacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversaciones
     SET ultimo_mensaje_at = NEW.created_at
   WHERE id = NEW.conversacion_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_conversacion ON mensajes;
CREATE TRIGGER trg_touch_conversacion
  AFTER INSERT ON mensajes
  FOR EACH ROW EXECUTE FUNCTION touch_conversacion();

-- Realtime: el hilo abierto recibe los mensajes nuevos sin recargar.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mensajes;
-- duplicate_object: ya estaba publicada. undefined_object: no existe la
-- publicación en este proyecto; el chat funciona igual, solo sin tiempo real.
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

-- ── Grupo general ─────────────────────────────────────────────────────────
-- Un hilo con todo el equipo, para que la bandeja no arranque vacía.
DO $$
DECLARE conv_id UUID;
BEGIN
  SELECT id INTO conv_id FROM conversaciones WHERE tipo = 'grupo' AND nombre = 'Equipo Tryvex';

  IF conv_id IS NULL THEN
    INSERT INTO conversaciones (tipo, nombre) VALUES ('grupo', 'Equipo Tryvex') RETURNING id INTO conv_id;
  END IF;

  INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
  SELECT conv_id, id FROM dim_integrantes WHERE activo = true
  ON CONFLICT DO NOTHING;
END $$;
