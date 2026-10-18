-- llamadas_resumen_mes (migracion 037) usa security_invoker = true, asi que
-- hereda el RLS de llamadas/llamada_participantes: solo cuenta llamadas de
-- conversaciones donde el usuario logueado participa. El dashboard de
-- Finanzas (consumoDelMes) subreportaba el gasto de la empresa entera sin
-- avisarlo, porque quien mira ese panel rara vez esta en todas las
-- conversaciones. Se agrega visibilidad completa para gestionar_finanzas,
-- igual patron que fact_ventas (067_permiso_gestionar_ventas.sql).

CREATE POLICY "finanzas ve todas las llamadas"
  ON llamadas FOR SELECT TO authenticated
  USING (tengo_permiso('gestionar_finanzas'));

CREATE POLICY "finanzas ve todos los participantes"
  ON llamada_participantes FOR SELECT TO authenticated
  USING (tengo_permiso('gestionar_finanzas'));
