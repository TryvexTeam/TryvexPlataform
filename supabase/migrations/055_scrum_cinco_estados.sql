-- 055 — Pipeline scrum de cinco columnas
--
-- El tablero pasa de tres estados a cinco:
--
--   Backlog · Por hacer · En curso · En revisión · Hecho
--
-- Los tres que ya existían NO se renombran. `sin_empezar` pasa a mostrarse
-- como "Por hacer" y `listo` como "Hecho", pero sus identificadores siguen
-- siendo los mismos: había 39 referencias en 12 archivos del frontend, y
-- renombrarlas a cambio de nada más que una etiqueta era regalar riesgo.
-- Lo que se ve es cosa de la interfaz; lo que se guarda no tiene por qué
-- moverse.
--
-- Así la migración no toca un solo dato existente: solo amplía lo que la
-- columna acepta.
--
--   backlog      → ideas y trabajo aún no comprometido
--   sin_empezar  → comprometido para el sprint, sin empezar   ("Por hacer")
--   en_curso     → alguien lo está haciendo
--   en_revision  → terminado, esperando revisión              (nuevo)
--   listo        → aceptado                                    ("Hecho")

alter table public.tareas
  drop constraint if exists tareas_estado_check;

alter table public.tareas
  add constraint tareas_estado_check
  check (estado in ('backlog', 'sin_empezar', 'en_curso', 'en_revision', 'listo'));

-- El valor por defecto se queda en `sin_empezar` y no baja a `backlog`: una
-- tarea que alguien se molesta en crear a mano ya está comprometida. Al backlog
-- se manda a propósito, arrastrándola.
