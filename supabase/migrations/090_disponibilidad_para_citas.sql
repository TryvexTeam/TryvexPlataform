-- Que la grilla de disponibilidad del equipo pueda ofrecer horas en la landing.
--
-- == El problema que resuelve ===============================================
--
-- Hoy el formulario de citas de tryvex.tech no sabe nada del CRM: ofrece una
-- lista fija de horarios (17:00 a 20:00, en src/lib/horarios.ts de la landing)
-- y la contrasta contra el freebusy de UN calendario de Google. La grilla de
-- `disponibilidad` -- donde cada integrante marca sus horas -- no participa.
--
-- == Por que dos interruptores y no uno =====================================
--
-- La grilla existente significa "estoy trabajando", NO "atiendo desconocidos".
-- Si se publicara tal cual, alguien que marco 10:00-20:00 porque ese es su
-- horario empezaria a recibir llamadas de venta que nunca pidio.
--
--   · `dim_integrantes.recibe_citas` -- interruptor maestro por persona.
--   · `disponibilidad.publica`       -- que celdas de su grilla se ofrecen.
--
-- Los dos apagados por defecto: al aplicar esto, la landing se comporta
-- exactamente igual que antes hasta que alguien encienda algo a mano. Ninguna
-- hora de nadie se publica por el solo hecho de correr esta migracion.
--
-- Y `recibe_citas` solo tiene efecto si el dueño ya marco `visible_en_landing`
-- (ver 044 y 088): aparecer en la web sigue siendo decision de la empresa, y
-- recibir citas es decision de cada uno. Dos llaves, ninguna alcanza sola.
--
-- == El GRANT columnar no es opcional =======================================
--
-- La 042 hizo REVOKE UPDATE sobre toda `dim_integrantes` y devolvio el
-- privilegio solo sobre columnas nombradas una por una. Una columna nueva NO
-- hereda nada: sin el GRANT, /api/perfil falla en runtime con «42501
-- permission denied for column recibe_citas» y no lo detecta ni el build ni el
-- lint ni los tipos. Mismo tropiezo que documentan la 044 y la 045.
--
-- `disponibilidad` no necesita GRANT columnar: sus privilegios son de tabla y
-- su RLS ya limita a cada integrante a sus propias filas (ver 004).

-- == 1 - El interruptor maestro por persona =================================

ALTER TABLE dim_integrantes
  ADD COLUMN IF NOT EXISTS recibe_citas BOOLEAN NOT NULL DEFAULT false;

GRANT UPDATE (recibe_citas) ON dim_integrantes TO authenticated;

COMMENT ON COLUMN dim_integrantes.recibe_citas IS
  'Si esta persona ofrece sus horas para citas desde la landing. Solo tiene efecto junto con visible_en_landing. Apagado por defecto: recibir desconocidos se elige, no se hereda.';

-- == 2 - Que celdas de la grilla se publican ================================
-- Por celda y no por persona: alguien puede querer atender de 17 a 20 y no
-- entre las 10 y las 13, aunque trabaje en las dos franjas.

ALTER TABLE disponibilidad
  ADD COLUMN IF NOT EXISTS publica BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN disponibilidad.publica IS
  'Si esta celda se ofrece como hora reservable en tryvex.tech. Apagada por defecto: la grilla significa "estoy trabajando", no "atiendo desconocidos".';

-- == 3 - Que el guardado de la grilla no borre la eleccion ==================
--
-- `reemplazar_disponibilidad` (073) hace DELETE + INSERT de todas las celdas
-- del integrante en cada guardado. Con la columna nueva, cada vez que alguien
-- toca su grilla en el CRM perderia que celdas habia publicado -- y lo peor es
-- que las perderia en silencio, quedando en false, que es el lado seguro pero
-- igual de equivocado.
--
-- Se recrea la funcion aceptando el arreglo de banderas. Mismo nombre, un
-- parametro nuevo CON DEFAULT para que la llamada actual de
-- lib/repos/disponibilidad.ts siga compilando y funcionando sin cambios
-- mientras no se actualice el front.
--
-- SECURITY INVOKER (el default, igual que la 073): corre con la RLS de quien
-- llama, que es lo que impide tocar la grilla de otro.

-- SIN `DEFAULT` en p_publicas, y esto no es un detalle de estilo: con
-- `DEFAULT NULL`, una llamada de 3 argumentos matchea LAS DOS versiones y
-- Postgres se niega a elegir:
--
--   ERROR: 42725: function reemplazar_disponibilidad(uuid, smallint[],
--                 smallint[]) is not unique
--
-- O sea: guardar la grilla desde el CRM deja de funcionar. Se descubrio
-- probandolo contra la base antes de dar la migracion por buena; no lo detecta
-- ningun build ni ningun tipo. Sin default, la llamada de 3 resuelve a la de 3
-- y la de 4 a la de 4, sin ambiguedad.
--
-- (Postgres tampoco deja quitar un default con CREATE OR REPLACE: pide DROP
-- primero. De ahi el DROP explicito.)

DROP FUNCTION IF EXISTS reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[], BOOLEAN[]);

CREATE FUNCTION reemplazar_disponibilidad(
  p_integrante_id UUID,
  p_dias          SMALLINT[],
  p_horas         SMALLINT[],
  p_publicas      BOOLEAN[]
) RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
  IF array_length(p_dias, 1) IS DISTINCT FROM array_length(p_horas, 1) THEN
    RAISE EXCEPTION 'dias y horas deben tener el mismo largo';
  END IF;

  IF p_publicas IS NOT NULL
     AND array_length(p_publicas, 1) IS DISTINCT FROM array_length(p_dias, 1) THEN
    RAISE EXCEPTION 'publicas debe tener el mismo largo que dias';
  END IF;

  DELETE FROM disponibilidad WHERE integrante_id = p_integrante_id;

  IF p_dias IS NULL OR array_length(p_dias, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO disponibilidad (integrante_id, dia_semana, hora, publica)
  SELECT
    p_integrante_id,
    p_dias[i],
    p_horas[i],
    -- Sin banderas (llamada vieja del front) todas quedan privadas. Es el lado
    -- seguro: publicar una hora tiene que ser un acto deliberado.
    COALESCE(p_publicas[i], false)
  FROM generate_subscripts(p_dias, 1) AS i;
END $fn$;

REVOKE EXECUTE ON FUNCTION reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[], BOOLEAN[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[], BOOLEAN[]) TO authenticated;

-- La version de 3 parametros de la 073 NO se borra, y no es por comodidad:
--
--   1. El front de hoy la llama con tres argumentos nombrados. Confiar en que
--      PostgREST resuelva la sobrecarga con el cuarto por defecto es apostar el
--      guardado de la grilla a un detalle de resolucion de firmas. Si falla, se
--      descubre con alguien perdiendo su disponibilidad.
--   2. Si simplemente delegara pasando NULL, cada guardado desde la pantalla
--      actual apagaria todas las celdas publicadas -- en silencio, porque
--      quedar en false no da error.
--
-- Asi que la de 3 conserva lo publicado: lee que celdas estaban marcadas antes
-- y vuelve a marcarlas sobre las que siguen existiendo. Guardar la grilla desde
-- la pantalla vieja deja de ser destructivo.

CREATE OR REPLACE FUNCTION reemplazar_disponibilidad(
  p_integrante_id UUID,
  p_dias          SMALLINT[],
  p_horas         SMALLINT[]
) RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
  v_publicas BOOLEAN[];
BEGIN
  -- Que celdas de las que entran estaban publicadas antes del reemplazo.
  SELECT array_agg(
           EXISTS (
             SELECT 1 FROM disponibilidad d
              WHERE d.integrante_id = p_integrante_id
                AND d.dia_semana    = p_dias[i]
                AND d.hora          = p_horas[i]
                AND d.publica
           )
           ORDER BY i
         )
    INTO v_publicas
    FROM generate_subscripts(p_dias, 1) AS i;

  PERFORM reemplazar_disponibilidad(p_integrante_id, p_dias, p_horas, v_publicas);
END $fn$;

REVOKE EXECUTE ON FUNCTION reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[]) TO authenticated;

-- == 4 - Indice para la consulta de la landing ==============================
-- El endpoint publico filtra por celdas publicas y nada mas; el indice parcial
-- solo indexa esas, que son una fraccion de la tabla.

CREATE INDEX IF NOT EXISTS idx_disponibilidad_publica
  ON disponibilidad (dia_semana, hora)
  WHERE publica = true;

-- == 5 - Comprobacion =======================================================
-- Correr DESPUES de aplicar.
--
-- (a) Las columnas existen y NADIE quedo publicado por accidente.
--     Las dos cuentas deben dar 0:
--       SELECT count(*) FROM dim_integrantes WHERE recibe_citas;
--       SELECT count(*) FROM disponibilidad  WHERE publica;
--
-- (b) El GRANT columnar quedo -- sin esto /api/perfil revienta con 42501:
--       SELECT count(*) FROM information_schema.column_privileges
--        WHERE table_name='dim_integrantes' AND grantee='authenticated'
--          AND privilege_type='UPDATE' AND column_name='recibe_citas';
--       -- debe dar 1
--
-- (c) Existen las DOS versiones (3 y 4 parametros), a proposito:
--       SELECT pg_get_function_identity_arguments(p.oid)
--         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--        WHERE n.nspname='public' AND p.proname='reemplazar_disponibilidad';
--       -- debe dar 2 filas
--
-- (c2) Y la de 3 conserva lo publicado, que es su unica razon de existir:
--        -- marcar una celda como publica, guardar la grilla desde el CRM sin
--        -- tocar esa celda, y comprobar que sigue publica:
--        SELECT count(*) FROM disponibilidad WHERE publica;  -- antes y despues, igual
--
-- (d) Y sigue sin ser llamable sin login (ver 088 y 089):
--       SELECT has_function_privilege('anon','public.reemplazar_disponibilidad(uuid,smallint[],smallint[],boolean[])','EXECUTE');
--       -- debe dar false
--       SELECT has_function_privilege('authenticated','public.reemplazar_disponibilidad(uuid,smallint[],smallint[],boolean[])','EXECUTE');
--       -- debe dar true
--
-- (e) El guardado de la grilla sigue funcionando desde el CRM: entrar a la
--     pantalla de disponibilidad, mover una celda, guardar, recargar y ver que
--     quedo. Esta es la que prueba que la sobrecarga no rompio nada.
