-- soy_superadmin() y tengo_permiso() (migración 028) no exigían activo = true, a
-- diferencia de IntegrantesRepository.getByAuthUser() (que sí lo hace y explica por
-- qué: dar de baja a alguien tiene que significar eso en toda la app, no solo donde
-- la RLS normal ya filtraba por is_integrante()).
--
-- Como estas dos funciones son SECURITY DEFINER y las usan las policies de
-- `jornadas` y `movimientos_financieros`, alguien desactivado que ya era
-- superadmin o tenía ver_finanzas/gestionar_finanzas seguía pasando esas policies
-- después de perder el acceso — el mismo hueco que el fix de getByAuthUser cerró
-- para las rutas de servicio, pero abierto todavía en el camino de RLS.

CREATE OR REPLACE FUNCTION soy_superadmin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(
    (SELECT es_superadmin FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true),
    false
  )
$$;

CREATE OR REPLACE FUNCTION tengo_permiso(p_permiso TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE((
    SELECT CASE
             WHEN i.es_superadmin THEN true
             WHEN p_permiso = 'ver_jornadas_equipo' THEN i.ver_jornadas_equipo
             WHEN p_permiso = 'ver_finanzas'        THEN i.ver_finanzas OR i.gestionar_finanzas
             WHEN p_permiso = 'gestionar_finanzas'  THEN i.gestionar_finanzas
             ELSE false
           END
      FROM dim_integrantes i
     WHERE i.auth_user_id = auth.uid() AND i.activo = true
  ), false)
$$;

-- El trigger de la 028 (extendido en la 044 con visible_en_landing) tampoco
-- exigía activo = true al validar quién puede cambiar privilegios: un
-- superadmin dado de baja podía seguir repartiendo accesos si su sesión
-- seguía viva. Se parte del cuerpo de la 044 (no de la 028) para no perder
-- el chequeo de visible_en_landing que esa migración agregó.
CREATE OR REPLACE FUNCTION guardar_flags_privilegio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cambio_flags BOOLEAN;
BEGIN
  cambio_flags :=
       NEW.es_superadmin       IS DISTINCT FROM OLD.es_superadmin
    OR NEW.es_admin            IS DISTINCT FROM OLD.es_admin
    OR NEW.ver_jornadas_equipo IS DISTINCT FROM OLD.ver_jornadas_equipo
    OR NEW.ver_finanzas        IS DISTINCT FROM OLD.ver_finanzas
    OR NEW.gestionar_finanzas  IS DISTINCT FROM OLD.gestionar_finanzas
    OR NEW.visible_en_landing  IS DISTINCT FROM OLD.visible_en_landing;

  IF NOT cambio_flags THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dim_integrantes
     WHERE auth_user_id = auth.uid() AND es_superadmin = true AND activo = true
  ) THEN
    RAISE EXCEPTION 'solo_superadmin_cambia_permisos'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.es_superadmin AND NOT NEW.es_superadmin THEN
    RAISE EXCEPTION 'superadmin_no_se_puede_degradar'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $fn$;
