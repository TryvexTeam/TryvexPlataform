-- 054 — Hora opcional en las tareas
--
-- `fecha_limite` es DATE y se queda como está. La hora va en una columna
-- aparte, nullable, en vez de convertir la fecha a timestamptz.
--
-- El motivo es que hacen falta TRES estados distinguibles, y un timestamp solo
-- da dos: una tarea guardada a medianoche sería indistinguible de una sin hora,
-- y justo esa diferencia decide si el calendario la pinta en su franja o como
-- chip del día. Con una columna nullable el "no tiene hora" es explícito.
--
-- De paso, ningún cálculo de vencimiento existente cambia de comportamiento:
-- todos comparan días chilenos contra `fecha_limite`, que sigue siendo DATE.
--
--   fecha_limite NULL                → la tarea no aparece en el calendario
--   fecha_limite + hora_limite NULL  → aparece en el día, como hasta ahora
--   fecha_limite + hora_limite       → aparece en su franja horaria
--
-- `time without time zone` y no `timetz`: la hora es la de Santiago, que es
-- donde opera el equipo. Una hora con offset propio permitiría guardar "14:00
-- en otro huso", que aquí no significa nada y solo abre la puerta a mezclar
-- husos dentro de la misma columna.

alter table public.tareas
  add column if not exists hora_limite time;

comment on column public.tareas.hora_limite is
  'Hora de Santiago del vencimiento. NULL = la tarea vence ese día pero sin hora fija.';

-- Una hora sin día no significa nada: sería una tarea que vence a las 15:00 de
-- ningún día. La base lo impide en vez de confiar en que la app no lo mande.
alter table public.tareas
  add constraint tareas_hora_exige_fecha
  check (hora_limite is null or fecha_limite is not null);
