-- eventos.create() (lib/repos/eventos.ts) insertaba el evento y sus asistentes en
-- dos llamadas separadas de PostgREST: si el INSERT en eventos_asistentes fallaba
-- (RLS, FK, red), el evento quedaba creado sin nadie asignado y sin forma de
-- deshacerlo desde el cliente.
--
-- Mismo patrón que set_proyecto_equipo/set_tarea_responsables (migración 063):
-- una función PL/pgSQL es una transacción implícita, así que si el INSERT de
-- asistentes falla acá adentro, Postgres revierte también el INSERT del evento.
-- SECURITY INVOKER (el default) para que corra con los privilegios y la RLS de
-- quien llama, igual que las dos llamadas que reemplaza.

CREATE OR REPLACE FUNCTION crear_evento_con_asistentes(
  p_titulo TEXT,
  p_tipo TEXT,
  p_inicio TIMESTAMPTZ,
  p_fin TIMESTAMPTZ,
  p_lead_id UUID,
  p_cliente_id UUID,
  p_notas TEXT,
  p_creado_por UUID,
  p_asistentes_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_evento_id UUID;
BEGIN
  INSERT INTO eventos (titulo, tipo, inicio, fin, lead_id, cliente_id, notas, creado_por)
  VALUES (p_titulo, p_tipo, p_inicio, p_fin, p_lead_id, p_cliente_id, p_notas, p_creado_por)
  RETURNING id INTO v_evento_id;

  -- Igual que en el repo original: sin asistentes explícitos, el creador queda
  -- como único asistente (un evento no puede quedar sin nadie).
  INSERT INTO eventos_asistentes (evento_id, integrante_id)
  SELECT DISTINCT v_evento_id, integrante_id
  FROM unnest(
    CASE WHEN array_length(p_asistentes_ids, 1) > 0 THEN p_asistentes_ids
         ELSE ARRAY[p_creado_por] END
  ) AS integrante_id;

  RETURN v_evento_id;
END;
$$;

REVOKE ALL ON FUNCTION crear_evento_con_asistentes(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crear_evento_con_asistentes(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, UUID, UUID[]) TO authenticated;
