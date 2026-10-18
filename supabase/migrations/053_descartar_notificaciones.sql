-- 053 — Descartar notificaciones propias
--
-- `notificaciones` tiene RLS activa con políticas de SELECT, INSERT y UPDATE,
-- pero ninguna de DELETE. En Postgres eso no es un error: la operación se
-- permite sintácticamente y borra CERO filas sin avisar, así que la interfaz
-- daba por descartada una notificación que seguía en la bandeja.
--
-- La regla es la misma que ya usan SELECT y UPDATE: cada quien manda sobre lo
-- suyo y sobre nada más.

create policy "borrar propias notificaciones"
  on public.notificaciones
  for delete
  using (
    integrante_id = (
      select dim_integrantes.id
      from public.dim_integrantes
      where dim_integrantes.auth_user_id = auth.uid()
    )
  );
