-- `completed_at` de `tareas` quedó muerta desde la migración 060: la columna
-- real que se usa para reportar "tareas completadas" es `completada_at`
-- (mantenida por el disparador `marcar_completada_at`). El código de la app
-- seguía escribiendo `completed_at` en cada cambio de estado sin que nada la
-- leyera nunca — trabajo redundante que además confundía cuál era la fuente
-- de verdad. `subtareas.completed_at` no se toca: ahí sí es la única marca
-- de completado que existe.

ALTER TABLE tareas DROP COLUMN IF EXISTS completed_at;
