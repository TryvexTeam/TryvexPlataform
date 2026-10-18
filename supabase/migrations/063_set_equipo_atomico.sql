-- setResponsables (tareas.ts) y fijarEquipo (proyectos.ts) hacían un DELETE seguido
-- de un INSERT como dos llamadas separadas de PostgREST: si el INSERT fallaba (RLS,
-- FK, red), la tarea/proyecto quedaba sin nadie asignado y sin forma de deshacerlo.
--
-- Un statement SQL (y por lo tanto una función PL/pgSQL) ya es una transacción
-- implícita: si el INSERT de acá adentro falla, Postgres revierte el DELETE
-- también. SECURITY INVOKER (el default) para que siga corriendo con los
-- privilegios y la RLS de quien llama, igual que las dos llamadas que reemplaza.

CREATE OR REPLACE FUNCTION set_tarea_responsables(p_tarea_id UUID, p_integrante_ids UUID[])
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM tarea_responsables WHERE tarea_id = p_tarea_id;

  INSERT INTO tarea_responsables (tarea_id, integrante_id)
  SELECT p_tarea_id, integrante_id
  FROM unnest(p_integrante_ids) AS integrante_id;
END;
$$;

REVOKE ALL ON FUNCTION set_tarea_responsables(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tarea_responsables(UUID, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION set_proyecto_equipo(p_proyecto_id UUID, p_integrante_ids UUID[])
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM proyecto_integrantes WHERE proyecto_id = p_proyecto_id;

  -- DISTINCT porque el formulario podría mandar un id repetido y la clave
  -- primaria compuesta rechazaría el insert entero por una fila duplicada.
  INSERT INTO proyecto_integrantes (proyecto_id, integrante_id)
  SELECT DISTINCT p_proyecto_id, integrante_id
  FROM unnest(p_integrante_ids) AS integrante_id;
END;
$$;

REVOKE ALL ON FUNCTION set_proyecto_equipo(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_proyecto_equipo(UUID, UUID[]) TO authenticated;
