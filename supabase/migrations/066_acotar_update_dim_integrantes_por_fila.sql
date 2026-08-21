-- Cierra el pendiente que dejo la 042: la policy "integrantes acceso total"
-- (FOR ALL, creada en un loop sobre doce tablas en la 000) sigue autorizando
-- UPDATE sobre CUALQUIER fila de dim_integrantes con tal de ser integrante
-- activo. Se combina por OR con "editar propio registro" (009, auth_user_id =
-- auth.uid()), y esa OR hace que la policy acotada no acote nada: cualquiera
-- puede reescribir el perfil publico de un companero (bio, telefono, linkedin,
-- la ficha que sale en tryvex.tech/team).
--
-- La 042 ya cerro las columnas peligrosas (auth_user_id, activo, email, flags
-- de privilegio) via GRANT columnar -- eso sigue intacto, no se toca aca. Esto
-- cierra la FILA: deja "integrantes acceso total" solo para SELECT (todo el
-- equipo necesita verse entre si -- listas, asignaciones, el selector de
-- responsables) y saca UPDATE/INSERT/DELETE de esa policy. Con eso la unica
-- policy que puede autorizar un UPDATE vuelve a ser "editar propio registro",
-- que ya acota por auth_user_id = auth.uid().
--
-- No rompe nada: INSERT/DELETE para `authenticated` ya estaban revocados por
-- GRANT desde la 042 (siguen igual de bloqueados, esto solo saca la policy
-- redundante). El unico UPDATE real que corre como `authenticated` es
-- updatePerfil (PATCH /api/perfil) y actualizar-permisos (PATCH /api/permisos),
-- ambos siempre sobre la fila del propio usuario.

DROP POLICY IF EXISTS "integrantes acceso total" ON dim_integrantes;

CREATE POLICY "integrantes acceso total"
  ON dim_integrantes FOR SELECT TO authenticated
  USING (is_integrante());

-- Comprobacion -- correr autenticado como un integrante que NO sea el dueno de <id>:
--   UPDATE dim_integrantes SET bio = 'test' WHERE id = '<otro-integrante>';
--   -- debe devolver 0 filas afectadas (bloqueado por RLS, no por GRANT)
-- Y que lo propio sigue funcionando:
--   UPDATE dim_integrantes SET bio = 'test' WHERE auth_user_id = auth.uid();
--   -- debe afectar 1 fila
