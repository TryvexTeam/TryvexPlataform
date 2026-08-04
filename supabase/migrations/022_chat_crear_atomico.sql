-- Abrir un chat devolvía 500. La causa, reproducida con una sesión real:
--
--   INSERT sin select                → 201
--   INSERT + return=representation   → 403 42501
--
-- PostgREST, al devolver la fila recién creada, la somete a la policy de SELECT.
-- La única que había es `es_miembro_conversacion(id)` — y el creador todavía NO
-- es miembro: la 019 lo dice en su propio comentario ("se vuelve miembro en el
-- paso siguiente"). El cliente hacía `.select('id').single()`, PostgREST devolvía
-- 42501, el repo lanzaba y el route respondía 500.
--
-- El parche mínimo sería una policy de SELECT para el creador. No alcanza: entre
-- el INSERT y el alta de miembros hay dos viajes al servidor, y si el segundo
-- falla queda una conversación huérfana que nadie ve ni puede borrar. Y en un DM,
-- dos personas escribiéndose a la vez chocan contra el UNIQUE de dm_key.
--
-- Se crea la conversación y sus miembros en UNA transacción, del lado del servidor.

-- ── Abrir (o recuperar) un DM ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION abrir_dm(otro_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $abrir_dm$
DECLARE
  mi_id   UUID := mi_integrante_id();
  clave   TEXT;
  conv_id UUID;
BEGIN
  IF mi_id IS NULL THEN
    RAISE EXCEPTION 'no_soy_integrante' USING ERRCODE = '42501';
  END IF;

  IF mi_id = otro_id THEN
    RAISE EXCEPTION 'no_dm_conmigo_mismo' USING ERRCODE = '22023';
  END IF;

  -- El otro tiene que existir y estar activo: si no, se abriría un hilo mudo.
  IF NOT EXISTS (SELECT 1 FROM dim_integrantes WHERE id = otro_id AND activo = true) THEN
    RAISE EXCEPTION 'integrante_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Misma clave que arma el cliente: los dos ids ordenados. Así el DM es único
  -- sin importar quién lo abre primero.
  clave := array_to_string(ARRAY(SELECT unnest(ARRAY[mi_id::text, otro_id::text]) ORDER BY 1), ':');

  SELECT id INTO conv_id FROM conversaciones WHERE dm_key = clave;
  IF conv_id IS NOT NULL THEN
    -- Existe pero pudo quedar sin alguno de los dos (hilo viejo, salida previa).
    INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
    VALUES (conv_id, mi_id), (conv_id, otro_id)
    ON CONFLICT DO NOTHING;
    RETURN conv_id;
  END IF;

  INSERT INTO conversaciones (tipo, dm_key, creada_por)
  VALUES ('dm', clave, mi_id)
  -- Carrera: si el otro lo creó entre el SELECT y el INSERT, no reventamos.
  ON CONFLICT (dm_key) DO UPDATE SET dm_key = EXCLUDED.dm_key
  RETURNING id INTO conv_id;

  INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
  VALUES (conv_id, mi_id), (conv_id, otro_id)
  ON CONFLICT DO NOTHING;

  RETURN conv_id;
END $abrir_dm$;

-- ── Crear un grupo ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crear_grupo(p_nombre TEXT, p_miembros UUID[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $crear_grupo$
DECLARE
  mi_id   UUID := mi_integrante_id();
  conv_id UUID;
BEGIN
  IF mi_id IS NULL THEN
    RAISE EXCEPTION 'no_soy_integrante' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(trim(p_nombre), '') = '' THEN
    RAISE EXCEPTION 'grupo_sin_nombre' USING ERRCODE = '22023';
  END IF;

  INSERT INTO conversaciones (tipo, nombre, creada_por)
  VALUES ('grupo', trim(p_nombre), mi_id)
  RETURNING id INTO conv_id;

  -- El creador siempre entra; los demás solo si están activos.
  INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
  SELECT conv_id, i.id
  FROM dim_integrantes i
  WHERE i.activo = true AND (i.id = mi_id OR i.id = ANY(p_miembros))
  ON CONFLICT DO NOTHING;

  RETURN conv_id;
END $crear_grupo$;

REVOKE ALL ON FUNCTION abrir_dm(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION crear_grupo(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abrir_dm(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION crear_grupo(TEXT, UUID[]) TO authenticated;

-- ── Red de seguridad ──────────────────────────────────────────────────────
-- Aunque la creación ya no dependa del SELECT posterior, el creador debería
-- poder ver lo que creó: sin esto, cualquier lectura hecha en el instante entre
-- el alta y el commit de los miembros vuelve a caer en el mismo agujero.
DROP POLICY IF EXISTS "ver conversacion que cree" ON conversaciones;
CREATE POLICY "ver conversacion que cree"
  ON conversaciones FOR SELECT TO authenticated
  USING (creada_por = mi_integrante_id());
