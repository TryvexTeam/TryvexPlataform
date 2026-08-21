-- Hallazgo de auditoría (especialista-db, 21/08): `mi_integrante_id()` no
-- chequeaba `activo=true`, a diferencia de `is_integrante()`/`tengo_permiso()`
-- (fix de la migración 062). Un integrante desactivado conserva su sesión de
-- Supabase Auth válida y, mientras esa sesión no se cierre a mano (o el
-- token expire), toda policy que dependa de esta función lo sigue tratando
-- como si pudiera actuar: notas de bitácora, salir/tocar miembros de chat,
-- reacciones, iniciar llamadas, crear grupos/DMs (`crear_grupo`/`abrir_dm`).
--
-- Se redefine una sola vez acá (con `CREATE OR REPLACE`, mismo nombre y
-- firma) y el fix se propaga solo a las ~20 policies que ya la usan — no
-- hace falta tocarlas una por una.
CREATE OR REPLACE FUNCTION mi_integrante_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true;
$$;

-- Índice que faltaba en `tarea_responsables.integrante_id`: el PK compuesto
-- (tarea_id, integrante_id) no sirve para buscar por integrante_id solo
-- ("mis tareas", lib/repos/tareas.ts). proyecto_integrantes y
-- conversacion_miembros ya tenían su índice secundario equivalente.
CREATE INDEX IF NOT EXISTS idx_tarea_responsables_integrante
  ON tarea_responsables (integrante_id);

-- La policy de DELETE de `notificaciones` quedó sin `TO authenticated`
-- explícito (las demás policies de la tabla sí lo tienen). El predicado ya
-- protegía en la práctica (no matchea filas para `anon`, que no tiene
-- integrante), pero se normaliza para no depender de que el predicado
-- siempre alcance a blindarla.
ALTER POLICY "borrar propias notificaciones" ON notificaciones TO authenticated;
