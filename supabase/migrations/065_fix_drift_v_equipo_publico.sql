-- Repara drift entre git y produccion en v_equipo_publico.
--
-- 064_equipo_publico_landing.sql definia la vista con un unico filtro,
-- WHERE activo = true. En produccion quedo con un filtro extra (parece
-- excluir integrantes con bio_corta/bio nulas) que nunca se reflejo en git:
-- de los 5 integrantes activos, solo 2 (los que ya habian completado su
-- ficha en /settings) aparecian en tryvex.tech/team.
--
-- Recrea la vista igual que en 064 -- no toca dim_integrantes, no borra datos.

DROP VIEW IF EXISTS v_equipo_publico;
CREATE VIEW v_equipo_publico AS
SELECT
  id,
  nombre,
  rol_principal AS role,
  bio_corta,
  bio,
  avatar_url AS photo,
  linkedin,
  portfolio,
  category
FROM dim_integrantes
WHERE activo = true;

GRANT SELECT ON v_equipo_publico TO anon;

-- Comprobacion -- debe devolver 5 filas (o el total de activo=true actual):
--   SELECT count(*) FROM v_equipo_publico;
