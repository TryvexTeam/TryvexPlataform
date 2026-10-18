-- DisponibilidadRepository.replaceOwn() hacia un DELETE seguido de un INSERT
-- en dos llamadas de PostgREST separadas: si el INSERT fallaba despues del
-- DELETE (red, payload grande), el integrante quedaba sin ninguna celda
-- guardada. Mismo patron que set_tarea_responsables/set_proyecto_equipo
-- (migracion 063): una funcion PL/pgSQL es una transaccion implicita.
--
-- SECURITY INVOKER (el default) para que corra con la RLS de quien llama —
-- la policy "integrante escribe su disponibilidad" ya exige que
-- p_integrante_id sea el propio, así que no hace falta repetir ese chequeo aca.
CREATE OR REPLACE FUNCTION reemplazar_disponibilidad(
  p_integrante_id UUID,
  p_dias SMALLINT[],
  p_horas SMALLINT[]
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF array_length(p_dias, 1) IS DISTINCT FROM array_length(p_horas, 1) THEN
    RAISE EXCEPTION 'p_dias y p_horas deben tener el mismo largo';
  END IF;

  DELETE FROM disponibilidad WHERE integrante_id = p_integrante_id;

  IF p_dias IS NULL OR array_length(p_dias, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO disponibilidad (integrante_id, dia_semana, hora)
  SELECT DISTINCT p_integrante_id, dia, hora
  FROM unnest(p_dias, p_horas) AS t(dia, hora);
END;
$$;

REVOKE ALL ON FUNCTION reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[]) TO authenticated;
