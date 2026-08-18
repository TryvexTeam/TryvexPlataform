-- Papelera de tareas: arrastrar una tarea fuera del kanban no debe borrarla.
--
-- Antes "eliminar" era un DELETE de verdad: perdias fecha limite, responsables,
-- subtareas y el historial de la tarjeta sin poder arrepentirte. Vicho pidio un
-- basurero estilo Windows: la tarea sale del tablero pero conserva todo su
-- contexto hasta que alguien la restaura o la borra a proposito.
--
-- eliminado_at marca cuando cayo a la papelera (NULL = tarea activa, visible en
-- el kanban normal). El DELETE de la fila sigue existiendo pero ahora es un paso
-- aparte, explicito, solo alcanzable desde la papelera ("eliminar definitivamente").
--
-- Idempotente: se puede correr dos veces.

ALTER TABLE tareas
  ADD COLUMN IF NOT EXISTS eliminado_at timestamptz;

COMMENT ON COLUMN tareas.eliminado_at IS
  'Momento en que la tarea se movio a la papelera. NULL = tarea activa. La fila y sus subtareas/responsables se conservan intactos hasta un borrado explicito.';

-- El kanban filtra por eliminado_at IS NULL en cada carga; sin indice eso
-- escanea toda la tabla cada vez que alguien abre /tareas.
CREATE INDEX IF NOT EXISTS idx_tareas_eliminado_at
  ON tareas (eliminado_at);
