-- 056 — Servicio del catálogo en el proyecto
--
-- Guarda con qué servicio del catálogo de Tryvex se creó el proyecto
-- (`lib/types/servicios.ts`). Al crearlo, ese servicio decide qué tareas nacen
-- con él: la landing esencial trae las suyas, el agente de IA las suyas.
--
-- Es `text` y no una clave foránea a una tabla de servicios: el catálogo es
-- una decisión comercial que vive en el código, no datos que el equipo edite.
-- Una tabla obligaría a mantener sincronizadas dos fuentes de lo mismo.
--
-- Nullable porque los proyectos anteriores al catálogo no tienen ninguno, y
-- porque se puede crear un proyecto sin plantilla y empezar de cero.

alter table public.dim_proyectos
  add column if not exists servicio_id text;

comment on column public.dim_proyectos.servicio_id is
  'Servicio del catálogo con el que se creó el proyecto (lib/types/servicios.ts). NULL en los proyectos anteriores al catálogo.';
