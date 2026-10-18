-- Se va la columna "Backlog" del tablero de tareas.
--
-- La agregó la 055 pensando en separar "ideas" de "trabajo comprometido". En la
-- práctica nunca cuajó: al 11-sep-2026 tenía 2 tareas de 23 vivas, ninguna con
-- fecha límite, mientras "Por hacer" acumulaba 11. Una columna que no se usa no
-- ordena el trabajo, solo suma una fila que hay que scrollear.
--
-- Las que estén ahí NO se pierden: suben a `sin_empezar` ("Por hacer"), que es
-- donde el equipo las iba a mirar igual.
--
-- ⚠️ Ojo con el orden: primero se mueven las filas, después se aprieta el check.
-- Al revés, el constraint rechaza las filas que todavía dicen 'backlog'.

update tareas
set estado = 'sin_empezar'
where estado = 'backlog';

alter table tareas drop constraint if exists tareas_estado_check;

alter table tareas add constraint tareas_estado_check
  check (estado in ('sin_empezar', 'en_curso', 'en_revision', 'listo'));

-- El default ya era 'sin_empezar' desde la 055, así que no hay que tocarlo.
-- Lo que sí cambia en el código: `lib/repos/proyectos.ts` creaba las tareas de
-- un proyecto nuevo directamente en 'backlog'. Con este constraint eso sería un
-- error al insertar, por eso el mismo PR lo cambia a 'sin_empezar'.
