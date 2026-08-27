-- Cerrar de verdad la escritura de `anon`, y que la vista publica no la reabra.
--
-- == Por que existe esta migracion si ya existe la 043 =======================
--
-- La 043 figura en el historial como aplicada. En la base no dejo rastro de
-- NINGUNA de sus partes. Medido el 2026-08-26 sobre produccion:
--
--   · 38 de las 40 tablas de `public` siguen con INSERT y DELETE para `anon`.
--   · Las 2 que si estan protegidas lo estan por OTRAS migraciones:
--       dim_integrantes         -> la 042 (anterior a la 043)
--       password_reset_intentos -> la 030
--   · v_equipo_publico y agentes_publicos, que la 043 nombra explicitamente,
--     tienen UPDATE y DELETE para `anon`.
--   · pg_default_acl conserva `anon=arwdDxtm` para el esquema public, o sea el
--     ALTER DEFAULT PRIVILEGES tampoco quedo.
--
-- Es decir: el candado nunca llego a existir. Lo unico que si ocurrio fue el
-- revoke manual del 2026-08-10 que la propia 043 menciona, y ese lo borro el
-- DROP VIEW de la 065 al recrear la vista.
--
-- Conclusion para el que lea esto en un año: el historial de migraciones NO es
-- prueba de que una migracion haya surtido efecto. La prueba es la seccion 5.
--
-- == Que se descarto tras medirlo ===========================================
--
-- Se sospecho que la 043 fallaba por escribir ALTER DEFAULT PRIVILEGES sin
-- `FOR ROLE`: pg_default_acl tiene dos entradas para public (una de `postgres`
-- y otra de `supabase_admin`) y sin FOR ROLE solo se cubre la del rol que
-- ejecuta. La medicion lo descarto como causa: los 47 objetos de public
-- (40 tablas + 7 vistas) son propiedad de `postgres`, ninguno de
-- `supabase_admin`, asi que cubrir `postgres` alcanza para todo lo que se crea
-- aca.
--
-- Igual se escribe el FOR ROLE explicito: no cambia el efecto hoy y deja dicho
-- a que rol aplica. La entrada de `supabase_admin` NO se puede tocar -- el rol
-- `postgres` de Supabase no es superusuario ni miembro de `supabase_admin`
-- (verificado con pg_has_role), y Postgres exige la membresia. Queda como
-- riesgo residual solo si algun dia un objeto de public lo crea ese rol (por
-- ejemplo al restaurar un backup); la comprobacion (a) de la seccion 5 lo
-- detecta si pasa.
--
-- == Los procesos del VPS: verificado, no supuesto =========================
--
-- El riesgo de este REVOKE es romper lo que escribe desde fuera de Next.js.
-- `scraper/` lee SUPABASE_KEY y, si falta, SUPABASE_SERVICE_KEY (scraper.py:43),
-- y el valor vive en el VPS. El nombre de la variable no prueba su contenido.
--
-- Se resolvio sin acceso al VPS, por deduccion sobre datos: `fact_leads` no
-- tiene NINGUNA policy para `anon`, asi que con la clave publica la RLS le
-- rechazaria toda escritura. La ultima corrida del scraper es del 2026-08-26
-- 07:19 UTC y grabo (29 filas en scraper_runs). Si escribe, no es `anon`.
--
-- `wa-bridge/` usa WA_BRIDGE_DB_SECRET, documentada como service_role en su
-- ENV-SETUP.md, y no depende de `anon`.
--
-- Conclusion: ningun proceso externo depende de los privilegios que se revocan.

-- == 1 - Primero el default, despues los objetos =============================
-- El orden importa y es lo que fallo antes: si se recrea la vista ANTES de
-- arreglar el default, la vista nueva nace otra vez con todo abierto.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon;

-- Y lo mismo para las funciones, que es de donde salia el otro agujero: el
-- default de Supabase incluye `anon=X` sobre FUNCTIONS, asi que cada funcion
-- nueva de `public` nace siendo llamable sin login por /rest/v1/rpc/.
-- Ver la seccion 4 para por que `REVOKE ... FROM PUBLIC` no lo evita.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- == 2 - Los objetos que ya existen =========================================
-- ON ALL TABLES alcanza tambien a las vistas. MAINTAIN es de PostgreSQL 17
-- (esta base corre 17.6) y aparece en el ACL actual, asi que se nombra.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public FROM anon;

-- Las siete vistas de public tienen hoy UPDATE y DELETE para `anon`. Seis
-- llevan security_invoker=true, asi que la RLS del invocador las contiene y su
-- riesgo era acotado. v_equipo_publico es la excepcion y la unica puerta real:
-- corre como su dueño, que bypassa la RLS de dim_integrantes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON v_equipo_publico FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON agentes_publicos  FROM anon, authenticated;

-- == 3 - La vista, con el filtro que la 065 se llevo por delante ============
--
-- La 044 agrego `visible_en_landing` para que aparecer en tryvex.tech fuera una
-- decision del dueño y no un efecto secundario de tener cuenta. La 065 recreo
-- la vista "igual que en 064" -- que es anterior a la 044 -- y el filtro se
-- perdio. La 077 lo arrastro. Hoy la vista viva no lo tiene.
--
-- Alcance real al momento de escribir esto: 5 integrantes activos, los 5 con
-- visible_en_landing = true. Nadie esta publicado sin quererlo; lo que esta
-- roto es el candado, no el estado. La proxima persona que entre al CRM se
-- publica sola.
--
-- Lo que NO se reintroduce, a proposito: los filtros `bio_corta IS NOT NULL` y
-- `avatar_url IS NOT NULL` de la 044. La 065 los quito por un bug real (de 5
-- activos solo aparecian 2). Hoy hay 1 activo sin bio_corta que dejaria de
-- verse si volvieran. Si se quiere una tarjeta sin huecos, eso se resuelve en
-- la landing, no escondiendo gente.
--
-- `rol_principal AS role` y no `especialidad`: la 078 migro los datos hacia
-- rol_principal y el formulario de /settings ya escribe ahi. Esa es la columna
-- canonica; cambiarla ahora desharia ese fix.
--
-- Sigue SIN security_invoker, deliberadamente (mismo criterio que 044, 045 y
-- 077): con invoker la consulta correria como `anon`, que no tiene ninguna
-- policy de SELECT sobre dim_integrantes, y la landing quedaria vacia sin error
-- visible. El SECURITY DEFINER es lo unico que permite exponer un subconjunto
-- de columnas sin abrir la tabla -- RLS filtra filas, no columnas. El linter de
-- Supabase avisa de esto y el aviso es esperado.

DROP VIEW IF EXISTS v_equipo_publico;
CREATE VIEW v_equipo_publico AS
SELECT
  id,
  nombre,
  rol_principal AS role,
  bio_corta,
  bio,
  COALESCE(foto_landing_url, avatar_url) AS photo,
  linkedin,
  portfolio,
  category
FROM dim_integrantes
WHERE activo = true
  AND visible_en_landing = true;

-- El DROP se lleva los grants: sin esto /team pierde el acceso y la landing
-- queda sin equipo. Y como el default ya quedo arreglado en la seccion 1, la
-- vista nace sin la escritura que traia antes.
GRANT SELECT ON v_equipo_publico TO anon;

-- == 4 - Las funciones que `anon` no deberia poder ejecutar =================
--
-- == Por que `REVOKE ... FROM PUBLIC` no alcanza ============================
--
-- Varias migraciones (069, 085, 087) cierran sus funciones asi:
--
--   REVOKE ALL ON FUNCTION f() FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION f() TO authenticated;
--
-- y eso NO cierra nada. `PUBLIC` es el pseudo-rol; el default de Supabase le
-- da EXECUTE a `anon` de forma EXPLICITA, y un grant explicito no se va
-- revocando el del pseudo-rol. Medido despues de aplicar la 087:
--
--   proacl de cerrar_llamadas_zombis_global:
--     {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, ...}
--
-- Resultado: 29 de las 30 funciones de `public` son ejecutables por `anon`, y
-- 18 de ellas son SECURITY DEFINER -- o sea corren con los privilegios del
-- dueño, saltando la RLS. Se cierran las 18 nombrando a `anon`, no a PUBLIC.
--
-- Revocar EXECUTE a un trigger NO impide que el trigger dispare: Postgres no
-- chequea ese privilegio en la ejecucion disparada por un evento, solo en la
-- llamada directa. Por eso el grupo A se puede cerrar a los dos roles.
--
-- Y se verifico antes de tocar nada que no hay NINGUNA policy `TO anon` en el
-- esquema (0 filas), asi que quitarle EXECUTE a los helpers de RLS no deja
-- ninguna policy sin poder evaluarse.

-- Grupo A - triggers. No los llama nadie por RPC; no tienen por que ser
-- llamables. Se cierran a los dos roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guardar_flags_privilegio()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guardar_fijado_mensaje()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_conversacion()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerebro_desde_estado_lead()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerebro_desde_interaccion()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerebro_desde_mensaje_wa()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerebro_desde_reunion()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cerebro_desde_venta()           FROM anon, authenticated;

-- Grupo B - solo service_role. `cerrar_llamadas_zombis_global` la llama el cron
-- (app/api/cron/llamadas-zombis/route.ts) con el cliente admin; hoy cualquiera
-- con la clave publica puede dispararla por /rest/v1/rpc/.
-- `limpiar_reset_intentos` no la llama nadie desde el codigo (solo se define en
-- la 030).
REVOKE EXECUTE ON FUNCTION public.cerrar_llamadas_zombis_global() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.limpiar_reset_intentos()        FROM anon, authenticated;

-- Grupo C - las usa la app con sesion, o las policias de RLS. Se le quita a
-- `anon` y se le deja a `authenticated`, que es quien las necesita:
--   abrir_dm / crear_grupo        -> lib/repos/chat.ts
--   cerrar_llamadas_zombis        -> lib/repos/llamadas.ts
--   es_miembro_conversacion, mi_integrante_id, soy_superadmin, tengo_permiso
--                                 -> se evaluan dentro de las policies
REVOKE EXECUTE ON FUNCTION public.abrir_dm(uuid)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.crear_grupo(text, uuid[])       FROM anon;
REVOKE EXECUTE ON FUNCTION public.cerrar_llamadas_zombis(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.es_miembro_conversacion(uuid)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_integrante_id()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.soy_superadmin()                FROM anon;
REVOKE EXECUTE ON FUNCTION public.tengo_permiso(text)             FROM anon;

-- == 5 - Comprobacion =======================================================
-- Correr DESPUES de aplicar. Las cuatro, no solo la primera: un candado que
-- ademas rompe la aplicacion no sirve.
--
-- (a) El default quedo, y no hay otro rol reabriendo la puerta.
--     Debe mostrar `anon` SIN a/w/d/D en la fila de `postgres`:
--       SELECT pg_get_userbyid(defaclrole), defaclacl::text
--         FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
--        WHERE n.nspname='public' AND d.defaclobjtype='r';
--
-- (b) Ningun objeto de public deja escribir a `anon`. Debe dar 0:
--       SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--        WHERE n.nspname='public' AND c.relkind IN ('r','v')
--          AND has_table_privilege('anon', c.oid, 'INSERT');
--
-- (c) La landing sigue viva -- esta es la mitad que nadie corre:
--       SELECT count(*) FROM v_equipo_publico;   -- debe dar 5
--     y https://www.tryvex.tech/team debe responder 200 con las 5 tarjetas.
--
-- (d) El candado de visibilidad FUNCIONA, que es distinto de estar escrito:
--       UPDATE dim_integrantes SET visible_en_landing=false WHERE nombre='<alguien>';
--       SELECT count(*) FROM v_equipo_publico;   -- debe dar 4
--       -- y volver a dejarlo en true
--     Verificar el efecto, no la definicion de la vista.
--
-- (e) Ninguna funcion SECURITY DEFINER queda llamable sin login. Debe dar 0:
--       SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--        WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
--          AND has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- (f) Y la app con sesion sigue pudiendo lo suyo -- la otra mitad, otra vez:
--       SELECT has_function_privilege('authenticated','public.abrir_dm(uuid)','EXECUTE');
--       -- debe seguir dando true; si da false, el chat de DMs quedo roto.
