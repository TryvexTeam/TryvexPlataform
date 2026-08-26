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
-- == Condicion previa, fuera de este repo ===================================
--
-- `scraper/` escribe desde el VPS con la clave que le inyecta el entorno
-- (scraper.py lee SUPABASE_KEY, y si falta, SUPABASE_SERVICE_KEY). El nombre
-- de la variable no prueba su valor: hay que confirmar que la cargada sea la
-- de servicio y no la publica, o este REVOKE lo rompe.
-- `wa-bridge/` esta verificado: usa WA_BRIDGE_DB_SECRET, documentada como
-- service_role en su ENV-SETUP.md, y no depende de `anon`.

-- == 1 - Primero el default, despues los objetos =============================
-- El orden importa y es lo que fallo antes: si se recrea la vista ANTES de
-- arreglar el default, la vista nueva nace otra vez con todo abierto.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon;

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
-- Los triggers no los llama nadie por RPC: no tienen por que ser ejecutables.
-- El resto son helpers internos de RLS.

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guardar_flags_privilegio()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soy_superadmin()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.mi_integrante_id()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.tengo_permiso(text)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.abrir_dm(uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.crear_grupo(text, uuid[])   FROM anon;

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
