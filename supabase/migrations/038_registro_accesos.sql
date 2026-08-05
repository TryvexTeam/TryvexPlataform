-- Revocar el acceso de alguien, de punta a punta, y dejar rastro de quien lo hizo.
--
-- El problema que cierra esta migracion: poner `activo = false` en dim_integrantes
-- protege los DATOS (la RLS pasa por `is_integrante()`, que exige `activo`) pero no
-- echa a nadie. La sesion de Supabase que ya tiene abierta sigue viva y su JWT sigue
-- siendo valido hasta que venza. Un despido no puede depender de que al despedido se
-- le venza el token.
--
-- Dos piezas aca:
--   1. `registro_accesos`  -- la bitacora: quien revoco a quien, cuando y por que.
--   2. `revocar_sesiones_auth()` -- lo unico capaz de matar la sesion de verdad.


-- == 1 - Bitacora de altas y bajas de acceso =================================
-- Por que existe: el dia que alguien pregunte "por que este no puede entrar" o
-- "quien lo saco", la respuesta no puede ser un encogimiento de hombros. Un
-- despido sin rastro es un problema legal, no solo operativo.
--
-- Por que se guarda el nombre y el correo copiados en vez de solo el FK: si el
-- integrante se borra algun dia, la fila del registro tiene que seguir diciendo
-- a quien se le quito el acceso. Un rastro que se vacia solo no es un rastro.
-- Por eso tambien el FK es ON DELETE SET NULL y no CASCADE.
CREATE TABLE IF NOT EXISTS registro_accesos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A quien se le toco el acceso
  integrante_id     UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  integrante_nombre TEXT NOT NULL,
  integrante_email  TEXT NOT NULL,

  -- Que se hizo. Texto con CHECK en vez de ENUM: agregar un valor a un ENUM
  -- obliga a otra migracion y no se puede hacer dentro de una transaccion.
  accion            TEXT NOT NULL CHECK (accion IN ('revocado', 'restaurado')),

  -- Quien lo hizo. Mismo criterio: se copia el correo para que el rastro sobreviva.
  actor_id          UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  actor_nombre      TEXT NOT NULL,
  actor_email       TEXT NOT NULL,

  motivo            TEXT,

  -- Cuantas sesiones se cerraron de verdad. Es la evidencia de que la revocacion
  -- fue efectiva y no solo un flag en una columna: si esto quedara siempre en 0
  -- sabriamos que la parte que echa a la persona no esta funcionando.
  sesiones_cerradas INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE registro_accesos IS
  'Bitacora de revocaciones y restauraciones de acceso. Solo la escribe el servidor.';

-- El acceso se consulta casi siempre "que paso ultimamente" o "que paso con esta
-- persona". Dos indices baratos para las dos preguntas.
CREATE INDEX IF NOT EXISTS idx_registro_accesos_fecha
  ON registro_accesos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registro_accesos_integrante
  ON registro_accesos (integrante_id, created_at DESC);

ALTER TABLE registro_accesos ENABLE ROW LEVEL SECURITY;

-- GRANT junto con la policy, no despues. En este repo ya paso tres veces: activar
-- RLS y escribir la policy sin dar el privilegio de tabla da 42501 igual, porque
-- son dos capas distintas -- la policy filtra FILAS, el GRANT abre la TABLA. Sin
-- GRANT no hay filas que filtrar.
GRANT SELECT ON registro_accesos TO authenticated;

-- Solo el dueno lee la bitacora. Contiene motivos de despido: no es informacion
-- de equipo, es informacion de direccion.
DROP POLICY IF EXISTS registro_accesos_select ON registro_accesos;
CREATE POLICY registro_accesos_select ON registro_accesos
  FOR SELECT TO authenticated USING (soy_superadmin());

-- No hay policy de INSERT/UPDATE/DELETE a proposito. Escribe el servidor con la
-- clave de servicio, que ignora la RLS. Que nadie pueda insertar desde el cliente
-- es justamente lo que hace que la bitacora valga como evidencia: si el propio
-- revocado pudiera escribir aca, no probaria nada.
GRANT INSERT ON registro_accesos TO service_role;
GRANT SELECT ON registro_accesos TO service_role;


-- == 2 - Cerrar las sesiones abiertas ========================================
-- Esta es la parte que de verdad echa a la persona, y no existe via SDK:
--
--   * `auth.admin.signOut(jwt, scope)` recibe el JWT DE LA PERSONA, no su id.
--     El servidor no tiene el JWT de un tercero, asi que no se puede usar para
--     revocar a otro.
--   * `updateUserById(id, { ban_duration })` impide FUTUROS inicios de sesion,
--     pero la documentacion de Supabase lo dice explicito: un ban no revoca las
--     sesiones existentes. El que ya esta adentro se queda adentro.
--
-- Lo que si funciona: borrar la fila de `auth.sessions`. Cada access token lleva
-- un claim `session_id`; GoTrue valida ese claim contra la tabla al atender
-- `/auth/v1/user`, que es exactamente lo que llama `supabase.auth.getUser()` en
-- el middleware. Sin la fila, esa llamada falla y la persona queda fuera en el
-- siguiente request, sin esperar a que venza nada.
--
-- SECURITY DEFINER porque el esquema `auth` no es alcanzable por PostgREST ni
-- siquiera con la clave de servicio. Se concede SOLO a service_role: ningun
-- usuario logueado puede invocarla, ni contra otros ni contra si mismo.
CREATE OR REPLACE FUNCTION revocar_sesiones_auth(p_auth_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public AS $fn$
DECLARE
  v_borradas INTEGER;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Los refresh tokens cuelgan de la sesion por FK con ON DELETE CASCADE, asi que
  -- borrar la sesion se los lleva. Se borran igual y primero por si alguna version
  -- de GoTrue deja tokens con session_id NULL: un refresh token vivo permitiria
  -- fabricar un access token nuevo y toda la revocacion no habria servido de nada.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_auth_user_id::TEXT;

  DELETE FROM auth.sessions WHERE user_id = p_auth_user_id;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  RETURN v_borradas;
END $fn$;

COMMENT ON FUNCTION revocar_sesiones_auth(UUID) IS
  'Borra las sesiones abiertas de un usuario. Solo service_role. Es lo unico que invalida un JWT ya emitido.';

REVOKE ALL ON FUNCTION revocar_sesiones_auth(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION revocar_sesiones_auth(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION revocar_sesiones_auth(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION revocar_sesiones_auth(UUID) TO service_role;


-- == 3 - Contar superadmins activos ==========================================
-- El endpoint necesita saber cuantos duenos activos quedarian antes de revocar, y
-- tiene que poder contarlos aunque no pueda leerlos. Se resuelve con una funcion
-- que devuelve solo el numero: no filtra ninguna fila ni ningun correo.
--
-- La regla que protege: si se revoca al ultimo superadmin activo, la cuenta queda
-- sin nadie capaz de revertirlo. No hay "olvide mi contrasena" para eso.
CREATE OR REPLACE FUNCTION contar_superadmins_activos()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $fn$
  SELECT COUNT(*)::INTEGER
    FROM dim_integrantes
   WHERE es_superadmin = true AND activo = true
$fn$;

REVOKE ALL ON FUNCTION contar_superadmins_activos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contar_superadmins_activos() TO authenticated;
GRANT EXECUTE ON FUNCTION contar_superadmins_activos() TO service_role;
