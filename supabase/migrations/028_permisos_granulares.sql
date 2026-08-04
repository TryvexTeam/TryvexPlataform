-- Permisos granulares: quién ve la jornada del equipo y quién ve las finanzas.
--
-- Por qué: hasta ahora "es_admin" era un interruptor único (lo tenía solo Ignacio) y
-- daba acceso a todo lo que estuviera detrás de un chequeo de admin. Se necesitan dos
-- cosas distintas: (a) un dueño que sea el único capaz de repartir accesos, y (b)
-- permisos sueltos que ese dueño pueda encender por persona sin convertirla en dueño.
--
-- Consecuencia: 'es_admin' deja de ser la puerta de las secciones sensibles. La puerta
-- pasa a ser el permiso específico (ver_jornadas_equipo / ver_finanzas / gestionar_finanzas),
-- y 'es_superadmin' es el único que puede cambiarlos. Un integrante no puede auto-otorgarse
-- nada: lo impide el trigger de más abajo, no solo la UI.

ALTER TABLE dim_integrantes
  ADD COLUMN IF NOT EXISTS es_superadmin        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_jornadas_equipo  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_finanzas         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestionar_finanzas   BOOLEAN NOT NULL DEFAULT false;

-- El dueño es la cuenta del correo, no "cualquiera que tenga es_admin".
UPDATE dim_integrantes
   SET es_superadmin       = true,
       es_admin            = true,
       ver_jornadas_equipo = true,
       ver_finanzas        = true,
       gestionar_finanzas  = true
 WHERE lower(email) = 'ignacio.andres.navarrete.silva@gmail.com';

-- Quien ya era admin conserva lo que veía antes (jornada del equipo), pero no gana finanzas.
UPDATE dim_integrantes
   SET ver_jornadas_equipo = true
 WHERE es_admin = true AND ver_jornadas_equipo = false;

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- `mi_integrante_id()` ya existe desde 019_chat_interno y NO se redefine aquí:
-- es SECURITY DEFINER y pisarla sin ese atributo rompería las policies del chat.
-- Estas dos siguen el mismo patrón. Solo leen la fila de quien pregunta
-- (auth.uid()), así que ser DEFINER no abre ninguna vía de escalada.

CREATE OR REPLACE FUNCTION soy_superadmin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(
    (SELECT es_superadmin FROM dim_integrantes WHERE auth_user_id = auth.uid()),
    false
  )
$$;

-- Un permiso concreto. El dueño los tiene todos por definición.
CREATE OR REPLACE FUNCTION tengo_permiso(p_permiso TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE((
    SELECT CASE
             WHEN i.es_superadmin THEN true
             WHEN p_permiso = 'ver_jornadas_equipo' THEN i.ver_jornadas_equipo
             WHEN p_permiso = 'ver_finanzas'        THEN i.ver_finanzas OR i.gestionar_finanzas
             WHEN p_permiso = 'gestionar_finanzas'  THEN i.gestionar_finanzas
             ELSE false
           END
      FROM dim_integrantes i
     WHERE i.auth_user_id = auth.uid()
  ), false)
$$;

REVOKE ALL ON FUNCTION soy_superadmin()       FROM PUBLIC;
REVOKE ALL ON FUNCTION tengo_permiso(TEXT)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soy_superadmin()    TO authenticated;
GRANT EXECUTE ON FUNCTION tengo_permiso(TEXT) TO authenticated;

-- ── El candado real: nadie sube sus propios privilegios ───────────────────────
-- RLS no distingue columnas, así que la policy de UPDATE de dim_integrantes no puede
-- separar "editar mi teléfono" de "hacerme admin". Este trigger sí.
CREATE OR REPLACE FUNCTION guardar_flags_privilegio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cambio_flags BOOLEAN;
BEGIN
  cambio_flags :=
       NEW.es_superadmin       IS DISTINCT FROM OLD.es_superadmin
    OR NEW.es_admin            IS DISTINCT FROM OLD.es_admin
    OR NEW.ver_jornadas_equipo IS DISTINCT FROM OLD.ver_jornadas_equipo
    OR NEW.ver_finanzas        IS DISTINCT FROM OLD.ver_finanzas
    OR NEW.gestionar_finanzas  IS DISTINCT FROM OLD.gestionar_finanzas;

  IF NOT cambio_flags THEN
    RETURN NEW;
  END IF;

  -- service_role (rutas de servidor, migraciones, seeds) no pasa por auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dim_integrantes
     WHERE auth_user_id = auth.uid() AND es_superadmin = true
  ) THEN
    RAISE EXCEPTION 'solo_superadmin_cambia_permisos'
      USING ERRCODE = '42501';
  END IF;

  -- El dueño no puede quitarse a sí mismo la condición de dueño: dejaría la cuenta
  -- de permisos sin nadie que pueda repartirlos.
  IF OLD.es_superadmin AND NOT NEW.es_superadmin THEN
    RAISE EXCEPTION 'superadmin_no_se_puede_degradar'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guardar_flags_privilegio ON dim_integrantes;
CREATE TRIGGER trg_guardar_flags_privilegio
  BEFORE UPDATE ON dim_integrantes
  FOR EACH ROW EXECUTE FUNCTION guardar_flags_privilegio();

-- ── Jornadas: la lectura del equipo pasa a depender del permiso ───────────────
DROP POLICY IF EXISTS "leer jornadas propias o admin" ON jornadas;
CREATE POLICY "leer jornadas propias o con permiso"
  ON jornadas FOR SELECT TO authenticated
  USING (
    integrante_id = mi_integrante_id()
    OR tengo_permiso('ver_jornadas_equipo')
  );

DROP POLICY IF EXISTS "actualizar jornada propia o admin" ON jornadas;
CREATE POLICY "actualizar jornada propia o con permiso"
  ON jornadas FOR UPDATE TO authenticated
  USING (
    integrante_id = mi_integrante_id()
    OR tengo_permiso('ver_jornadas_equipo')
  )
  WITH CHECK (
    integrante_id = mi_integrante_id()
    OR tengo_permiso('ver_jornadas_equipo')
  );
