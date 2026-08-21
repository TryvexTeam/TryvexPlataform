-- fact_ventas seguia con la policy generica "integrantes acceso total" (000_schema_inicial.sql):
-- cualquier integrante activo podia crear, editar o BORRAR cualquier venta/cobro, sin pasar por
-- el permiso 'gestionar_finanzas' que ya protege a movimientos_financieros (029_finanzas.sql).
--
-- SELECT se mantiene abierto a todo integrante: el historial de ventas se muestra en la ficha de
-- cliente y en proyectos para todo el equipo, no solo para quien administra finanzas.

DROP POLICY IF EXISTS "integrantes acceso total" ON fact_ventas;

DROP POLICY IF EXISTS "leer ventas" ON fact_ventas;
CREATE POLICY "leer ventas"
  ON fact_ventas FOR SELECT TO authenticated
  USING (is_integrante());

DROP POLICY IF EXISTS "crear venta con permiso" ON fact_ventas;
CREATE POLICY "crear venta con permiso"
  ON fact_ventas FOR INSERT TO authenticated
  WITH CHECK (tengo_permiso('gestionar_finanzas'));

DROP POLICY IF EXISTS "editar venta con permiso" ON fact_ventas;
CREATE POLICY "editar venta con permiso"
  ON fact_ventas FOR UPDATE TO authenticated
  USING (tengo_permiso('gestionar_finanzas'))
  WITH CHECK (tengo_permiso('gestionar_finanzas'));

DROP POLICY IF EXISTS "borrar venta con permiso" ON fact_ventas;
CREATE POLICY "borrar venta con permiso"
  ON fact_ventas FOR DELETE TO authenticated
  USING (tengo_permiso('gestionar_finanzas'));
