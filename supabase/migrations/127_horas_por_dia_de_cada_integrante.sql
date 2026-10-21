-- Perfil del integrante: las horas trabajadas de cada uno, a la vista del equipo.
--
-- Las jornadas tienen RLS "propias o con permiso" (ver_jornadas_equipo): la entrada,
-- la salida y la nota de cada jornada siguen siendo de cada uno. Lo que el perfil
-- necesita es menos que eso: cuántas horas trabajó cada día. Decisión de Cristian
-- (18-oct): todo el equipo ve lo de todos mientras sea trabajo de Tryvex.
--
-- Por eso esta función devuelve SOLO el total por día (hora de Chile), con la misma
-- cuenta que jornadas_resumen (descuenta las pausas cerradas). Pide ser integrante
-- activo; un usuario sin integrante recibe un error, no una lista vacía.

CREATE OR REPLACE FUNCTION horas_por_dia_integrante(p_integrante UUID, p_desde DATE)
RETURNS TABLE (fecha DATE, horas NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_integrante() THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.fecha_local, ROUND(SUM(r.horas), 2)
  FROM jornadas_resumen r
  WHERE r.integrante_id = p_integrante
    AND r.fecha_local >= p_desde
  GROUP BY r.fecha_local
  ORDER BY r.fecha_local;
END $$;

REVOKE EXECUTE ON FUNCTION horas_por_dia_integrante(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION horas_por_dia_integrante(UUID, DATE) TO authenticated;
