-- La otra mitad del candado de la 088: PUBLIC.
--
-- == Que quedo abierto y por que ============================================
--
-- La 088 revoco EXECUTE nombrando a `anon`, porque el default de Supabase le da
-- un grant EXPLICITO y `REVOKE ... FROM PUBLIC` no lo saca. Correcto, pero es
-- solo una mitad. Medido despues de aplicarla, 10 funciones SECURITY DEFINER
-- seguian llamables sin login:
--
--   proacl de handle_new_auth_user tras la 088:
--     {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--            ^^^ esto es PUBLIC
--
-- `anon=X` ya no esta, pero queda `=X`, que es EXECUTE para PUBLIC -- y todo
-- rol es miembro de PUBLIC, `anon` incluido. Ese grant no lo pone Supabase:
-- lo pone Postgres, que otorga EXECUTE a PUBLIC en toda funcion nueva.
--
-- La leccion completa, que ninguna de las dos mitades tenia sola:
--
--   Las migraciones 069, 085 y 087 revocaban de PUBLIC y no de anon.
--   La 088 revoco de anon y no de PUBLIC.
--   Cerrar una funcion en Supabase requiere revocar de LOS DOS.
--
-- == Por que el REVOKE masivo es seguro =====================================
--
-- Se verifico funcion por funcion antes de escribir esto: NINGUNA depende de
-- PUBLIC para que `authenticated` la use. Las que la app necesita
-- (abrir_dm, crear_grupo, cerrar_llamadas_zombis, is_integrante,
-- es_miembro_conversacion, mi_integrante_id, soy_superadmin, tengo_permiso,
-- crear_evento_con_asistentes, reemplazar_disponibilidad, set_proyecto_equipo,
-- set_tarea_responsables, buscar_conocimiento) tienen `authenticated=X`
-- explicito en su ACL, que sobrevive a este REVOKE.
--
-- `buscar_conocimiento` ademas tiene `vex_bot=X` explicito: tambien sobrevive.
--
-- El unico consumidor con la clave publica es la landing, y solo hace SELECT
-- sobre v_equipo_publico -- no llama ningun RPC.

-- == 1 - Las que ya existen =================================================

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- == 2 - Las que se creen mañana ============================================
-- La 088 ya saco a `anon` del default. Falta PUBLIC, que es de donde salio
-- este agujero. Consecuencia buscada: a partir de aca, una funcion nueva NO es
-- llamable por nadie hasta que su migracion otorgue el acceso a mano.
-- Es el mismo criterio que ya siguen 069, 085 y 087 al cerrar con GRANT
-- explicito a authenticated / service_role.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- == 3 - Comprobacion =======================================================
-- Correr DESPUES. Las dos mitades, como siempre.
--
-- (a) Ninguna funcion SECURITY DEFINER llamable sin login. Debe dar 0:
--       SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--        WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
--          AND has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- (b) Ninguna funcion de public llamable por anon, definer o no. Debe dar 0:
--       SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--        WHERE n.nspname='public' AND p.prokind='f'
--          AND has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- (c) La app con sesion sigue entera. Las cinco deben dar true:
--       SELECT has_function_privilege('authenticated','public.abrir_dm(uuid)','EXECUTE'),
--              has_function_privilege('authenticated','public.is_integrante()','EXECUTE'),
--              has_function_privilege('authenticated','public.tengo_permiso(text)','EXECUTE'),
--              has_function_privilege('authenticated','public.reemplazar_disponibilidad(uuid,smallint[],smallint[])','EXECUTE'),
--              has_function_privilege('service_role','public.cerrar_llamadas_zombis_global()','EXECUTE');
--
--     `is_integrante` es la que mas importa: la evaluan casi todas las policies
--     del esquema. Si queda en false, el CRM entero deja de leer datos.
