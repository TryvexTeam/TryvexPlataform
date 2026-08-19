-- 057 — Un proyecto puede llevar varios servicios
--
-- Una venta real rara vez es un solo servicio: se cierra una landing más la
-- automatización de un proceso, o un MVP más la atención por WhatsApp. Con una
-- sola columna había que crear un proyecto por servicio y repartir a mano lo
-- que el cliente entiende como un único encargo.
--
-- `servicio_id` (singular) pasa a `servicios_ids` (lista). Se conserva la
-- columna vieja hasta que no queden lecturas: renombrar en caliente dejaría el
-- despliegue anterior leyendo una columna que ya no existe.
--
-- Es un array de texto y no una tabla puente porque el catálogo vive en el
-- código, no en la base: una tabla obligaría a sincronizar dos fuentes de lo
-- mismo cada vez que cambie la oferta comercial.

alter table public.dim_proyectos
  add column if not exists servicios_ids text[] not null default '{}';

comment on column public.dim_proyectos.servicios_ids is
  'Servicios del catálogo vendidos en este proyecto (lib/types/servicios.ts). Vacío en los proyectos anteriores al catálogo.';

-- Los proyectos que ya tuvieran servicio pasan a la lista sin perderlo.
update public.dim_proyectos
   set servicios_ids = array[servicio_id]
 where servicio_id is not null
   and servicios_ids = '{}';
