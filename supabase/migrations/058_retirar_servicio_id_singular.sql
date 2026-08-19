-- 058 — Se retira `servicio_id` (singular)
--
-- La migración 057 lo dejó en pie a propósito: renombrar una columna en
-- caliente deja al despliegue que sigue en vivo leyendo algo que ya no existe.
-- Ese periodo de convivencia ya pasó — no queda una sola lectura en el código
-- y su contenido está en `servicios_ids`.
--
-- Comprobado antes de ejecutarlo: cero filas tenían servicio viejo sin su
-- equivalente en la lista nueva.

alter table public.dim_proyectos
  drop column if exists servicio_id;
