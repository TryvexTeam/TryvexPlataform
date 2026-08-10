-- Sacarle a `anon` la escritura sobre el schema public, y que no vuelva sola.
--
-- == De donde salio esto ====================================================
--
-- Auditando otra cosa aparecio que `anon` -- el rol de la clave publica, la que
-- viaja en el navegador de cualquiera que abra la landing -- tenia
-- INSERT, UPDATE, DELETE y TRUNCATE sobre las 42 tablas de `public`. No lo puso
-- ninguna migracion: es el grant por defecto de Supabase, que nadie acoto nunca.
--
-- Hasta ahora el dano lo contenia la RLS, no el privilegio: todas las policies
-- son TO authenticated, asi que a `anon` le devolvian cero filas. Pero eso deja
-- la seguridad colgando de que nadie escriba nunca una policy TO anon por
-- conveniencia, y de que ninguna vista abra un camino lateral.
--
-- Lo segundo ya habia pasado. `v_equipo_publico` (040) es un SELECT simple de
-- una sola tabla, o sea AUTO-ACTUALIZABLE para Postgres, y PostgREST expone las
-- vistas actualizables por PATCH y DELETE. Como corre con los permisos del dueno
-- --que es lo que la hace util para leer sin RLS-- esos permisos tambien valian
-- para escribir: con la clave publica y sin login se podia modificar y borrar
-- filas de dim_integrantes a traves de la vista. Se revoco a mano el 2026-08-10;
-- se repite aca para que la migracion refleje el estado final.
--
-- == Por que es seguro revocar ==============================================
--
-- Se auditaron TODOS los puntos de escritura alcanzables sin sesion. Ninguno
-- corre como `anon`:
--
--   /api/auth/recuperar, /api/invitaciones/[token], /api/agentes/mensajes,
--   /api/webhook/scraper, /api/webhook/google-calendar, /api/cron/*
--       -> todos usan createAdminClient() = service_role
--   signup -> escribe en auth.users por GoTrue; la fila de dim_integrantes la
--             crea el trigger handle_new_auth_user, que es SECURITY DEFINER
--   el resto de /api/** -> el middleware las rebota sin sesion; corren como
--             `authenticated`
--
-- service_role no pasa por estos grants, asi que nada de eso se ve afectado.
--
-- OJO, condicion previa fuera de este repo: `scraper/` y `wa-bridge/` escriben
-- desde el VPS con una clave inyectada por entorno. Debe ser la de servicio. Si
-- alguna estuviera cargada con la clave publica, este REVOKE los rompe.

-- == 1 - Escritura fuera para anon, en todo el schema ========================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon;

-- `ON ALL TABLES` alcanza tambien a las vistas. Se repiten las dos
-- auto-actualizables de forma explicita: son el camino que salta la RLS, y
-- conviene que queden nombradas para el que lea esto en un año.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON v_equipo_publico FROM anon, authenticated;
GRANT SELECT ON v_equipo_publico TO anon;

-- agentes_publicos (035) tambien es auto-actualizable, aunque lleva
-- security_invoker = true, asi que la RLS del invocador si le aplica y el riesgo
-- era acotado. Se cierra igual: que dependa del privilegio y no solo de la RLS.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON agentes_publicos FROM anon, authenticated;
GRANT SELECT ON agentes_publicos TO authenticated;

-- NO tocar el security_invoker de v_equipo_publico. Alguien va a proponerlo al
-- ver el aviso del linter de Supabase: con security_invoker la vista aplicaria
-- la RLS del invocador, `anon` no tiene ninguna policy sobre dim_integrantes, y
-- la landing publica se quedaria vacia para siempre. El SECURITY DEFINER es
-- deliberado y es lo unico que permite exponer columnas elegidas sin abrir la
-- tabla entera -- RLS filtra filas, no columnas.

-- == 2 - Lo que quedaba suelto en dim_integrantes ============================
-- La 042 acoto UPDATE y saco DELETE/INSERT, pero estos tres venian del mismo
-- default y quedaron. TRUNCATE es el que importa: vacia la tabla entera y NO lo
-- filtra la RLS -- las policies solo aplican a SELECT/INSERT/UPDATE/DELETE.
-- De dim_integrantes cuelgan cascadas a jornadas, chat, llamadas y push.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON dim_integrantes FROM authenticated;

-- == 3 - Que no vuelva con la proxima tabla ==================================
-- Sin esto, la tabla que alguien cree mañana nace con los mismos privilegios de
-- fabrica y volvemos al principio. El repo venia revocando caso por caso (030,
-- 042) sin tocar nunca el default, que es de donde salia el problema.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;

-- == 4 - Comprobacion ========================================================
-- Correr DESPUES. Debe devolver CERO filas:
--
--   SELECT table_name, privilege_type
--     FROM information_schema.table_privileges
--    WHERE grantee = 'anon' AND table_schema = 'public'
--      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
--
-- Y las dos que tienen que seguir andando, que es la otra mitad de la prueba:
--
--   SET ROLE anon; SELECT count(*) FROM v_equipo_publico;  -- sin error
--   -- y https://www.tryvex.tech/team debe responder 200
--
-- Un candado que ademas rompe la aplicacion no sirve: las dos pruebas, no solo
-- la primera.
