-- Cerrar la escritura directa a dim_integrantes: hoy cualquier integrante puede
-- editar la fila de cualquier otro, incluida la del dueno.
--
-- == Que esta abierto hoy ====================================================
--
-- La 000 crea, en un loop sobre doce tablas:
--
--   CREATE POLICY "integrantes acceso total" ON dim_integrantes
--     FOR ALL TO authenticated USING (is_integrante()) WITH CHECK (is_integrante())
--
-- Ni la 035 ni la 036 la eliminan. Y las policies se combinan con OR, asi que la
-- policy "editar propio registro" de la 009 (auth_user_id = auth.uid()) NO acota
-- nada: la de arriba ya autoriza. En los hechos, cualquier integrante activo
-- puede UPDATE, INSERT y DELETE cualquier fila de la tabla.
--
-- El trigger guardar_flags_privilegio de la 028 tapa una parte -- es_admin,
-- es_superadmin y los flags de finanzas y jornadas -- pero NO mira auth_user_id.
-- Ese es el hueco que importa:
--
--   update dim_integrantes set auth_user_id = '<mi auth.uid()>' where id = '<el dueno>'
--
-- La policy lo permite (soy integrante), el trigger no se entera (no cambio
-- ningun flag), y a partir de ahi soy_superadmin() y tengo_permiso() -- que
-- resuelven por auth_user_id -- reconocen al atacante como dueno. Sin tocar un
-- solo permiso. Tampoco estan protegidas `activo` (dar de baja a un companero)
-- ni `email`.
--
-- == Por que por GRANT y no por policy =======================================
--
-- RLS decide QUE FILAS, no QUE COLUMNAS. Para separar "editar mi telefono" de
-- "reescribir el auth_user_id del dueno" hace falta privilegio columnar, que es
-- justo lo que Postgres si sabe hacer. Mismo razonamiento que ya escribio la 028
-- en su comentario, resuelto ahora en la capa que corresponde.
--
-- No rompe nada: las columnas que quedan permitidas son EXACTAMENTE las que hoy
-- escriben las dos rutas que corren como `authenticated`.
--
--   · lib/repos/integrantes.ts:60  (updatePerfil <- PATCH /api/perfil)
--       nombre, especialidad, telefono, color, horario, notificaciones,
--       bio_corta, bio, linkedin, portfolio, category
--   · lib/repos/permisos.ts:46     (actualizar  <- PATCH /api/permisos)
--       ver_jornadas_equipo, ver_finanzas, gestionar_finanzas
--
-- Todo lo demas que escribe la tabla (avatar_url en /api/perfil/avatar, activo en
-- lib/repos/acceso.ts, el alta del trigger de la 007) corre con service_role, que
-- no pasa por estos grants.

-- == 1 - Escritura acotada a columnas ========================================

REVOKE UPDATE ON dim_integrantes FROM authenticated;

GRANT UPDATE (
  -- perfil propio (validado por PerfilUpdateSchema en /api/perfil)
  nombre, especialidad, telefono, color, horario, notificaciones,
  -- ficha publica de tryvex.tech (ver 040 y v_equipo_publico)
  bio_corta, bio, linkedin, portfolio, category,
  -- permisos: los cambia /api/permisos, y el trigger de la 028 exige superadmin
  ver_jornadas_equipo, ver_finanzas, gestionar_finanzas
) ON dim_integrantes TO authenticated;

-- Queda cerrado, sin que ninguna pantalla lo necesite:
--   auth_user_id  -> era la escalada a dueno
--   activo        -> dar de baja a un companero
--   email, id     -> suplantacion
--   es_admin, es_superadmin, es_agente -> ya los cuidaba el trigger; ahora tambien el grant
--   avatar_url    -> lo escribe service_role
--   rol_principal -> sale publicado en la landing sin pasar por Zod

-- == 2 - Nadie borra integrantes desde el navegador ==========================
-- El `FOR ALL` de la 000 incluye DELETE, y de dim_integrantes cuelgan cascadas a
-- jornadas, chat, llamadas y push. Ningun codigo de la app lo usa: las bajas van
-- por lib/repos/acceso.ts, que corre con service_role y marca `activo = false` en
-- vez de borrar.

REVOKE DELETE, INSERT ON dim_integrantes FROM authenticated;

-- == 3 - Comprobacion ========================================================
-- Correr DESPUES de aplicar. Debe listar solo las 14 columnas de arriba:
--
--   SELECT column_name, privilege_type
--     FROM information_schema.column_privileges
--    WHERE table_name = 'dim_integrantes' AND grantee = 'authenticated'
--    ORDER BY column_name;
--
-- Y la prueba que de verdad importa -- que el hueco quedo cerrado:
--
--   SET ROLE authenticated;
--   UPDATE dim_integrantes SET auth_user_id = gen_random_uuid() WHERE id = '<id>';
--   -- debe fallar con 42501 permission denied for column auth_user_id
--   RESET ROLE;
--
-- Y que lo que la app SI hace sigue andando: editar el propio nombre desde
-- /settings tiene que seguir guardando sin error.
--
-- PENDIENTE, en otra migracion: la policy "integrantes acceso total" sigue
-- dejando que un integrante edite las columnas de perfil de OTRO integrante (su
-- bio, su telefono). Ya no es escalada de privilegio, pero sigue sin ser
-- correcto. Se crea en un loop sobre doce tablas, asi que acotarla tiene alcance
-- mas alla de esta tabla y se trata aparte.
