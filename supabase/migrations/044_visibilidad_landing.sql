-- Quien aparece en tryvex.tech/team lo decide el dueño desde el CRM, no el propio integrante.
--
-- Que estaba mal: la 040 conectó la landing con dim_integrantes filtrando solo por
-- `activo = true`. Es decir, cualquier persona que entrara al CRM y completara su
-- ficha se autopublicaba en la web de la empresa. La visibilidad publica es una
-- decisión editorial de la empresa, no un efecto secundario de tener cuenta.
--
-- Ademas, el cargo mostrado salia de `rol_principal`, que es un campo operativo
-- interno ("admin", "dev"). Lo que corresponde mostrar afuera es `especialidad`,
-- que es como la persona se presenta.
--
-- Tres piezas, y ninguna sobra:
--   1. La columna `visible_en_landing`, apagada por defecto.
--   2. El GRANT columnar -- sin el, la 042 hace que la pantalla falle con 42501.
--   3. El trigger de la 028 extendido -- sin el, cualquier integrante se publica solo.

-- == 1 - La columna, apagada por defecto ======================================
-- DEFAULT false y no true: al aplicar esto la landing queda vacía hasta que el
-- dueño encienda a cada persona. Preferimos una landing vacía por un rato antes
-- que publicar a alguien que no eligió estar ahí.

ALTER TABLE dim_integrantes
  ADD COLUMN IF NOT EXISTS visible_en_landing BOOLEAN NOT NULL DEFAULT false;

-- == 2 - El GRANT columnar ====================================================
-- La 042 hizo REVOKE UPDATE sobre toda la tabla y devolvió el privilegio solo
-- sobre 14 columnas nombradas. Una columna nueva NO hereda nada: sin esta linea
-- /api/permisos falla en runtime con «42501 permission denied for column
-- visible_en_landing», y ningun test de tipos ni lint lo detecta.

GRANT UPDATE (visible_en_landing) ON dim_integrantes TO authenticated;

-- == 3 - Solo el dueño la cambia ==============================================
-- Mismo razonamiento de la 028: RLS decide que filas, no que columnas, así que el
-- candado por integrante vive en el trigger. Se recrea la función completa (no hay
-- forma de "agregarle" una condición) sumando la columna a la comparación.
--
-- El cuerpo va delimitado con $fn$ y no con $$: el SQL Editor de Supabase corta mal
-- los $$ anidados y la función llega truncada a la base.

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
    -- Nuevo: aparecer en la web de la empresa se reparte igual que un permiso.
    OR NEW.visible_en_landing  IS DISTINCT FROM OLD.visible_en_landing;

  IF NOT cambio_flags THEN
    RETURN NEW;
  END IF;

  -- service_role (rutas de servidor, migraciones, seeds) no pasa por auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dim_integrantes
     WHERE auth_user_id = auth.uid() AND es_superadmin = true
  ) THEN
    RAISE EXCEPTION 'solo_superadmin_cambia_permisos'
      USING ERRCODE = '42501';
  END IF;

  -- El dueño no puede quitarse a sí mismo la condición de dueño: dejaría la cuenta
  -- de permisos sin nadie que pueda repartirlos.
  IF OLD.es_superadmin AND NOT NEW.es_superadmin THEN
    RAISE EXCEPTION 'superadmin_no_se_puede_degradar'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $fn$;

-- El trigger de la 028 ya apunta a esta función por nombre, así que CREATE OR
-- REPLACE alcanza: no hace falta recrearlo.

-- == 4 - La vista publica =====================================================
-- Dos cambios respecto de la 040:
--
--   · `especialidad AS role` en vez de `rol_principal AS role`. rol_principal es
--     interno y ademas la 042 ya no deja escribirlo desde la app, así que hoy es
--     un campo que nadie mantiene. `especialidad` sí la edita cada persona en
--     /settings y pasa por Zod.
--   · `visible_en_landing = true` sumado a los filtros que ya corren en produccion.
--
-- Los filtros de bio_corta y avatar_url NO son nuevos: son los que tiene aplicada
-- la base hoy (se agregaron a mano sobre la 040) y se conservan tal cual. Una
-- tarjeta sin bio ni foto se ve rota en la landing; el filtro es la red de
-- seguridad, y el switch de mas arriba es la decision.
--
-- Deliberadamente SIN `security_invoker = true`: la vista tiene que seguir siendo
-- SECURITY DEFINER. RLS filtra filas, no columnas, y con invoker la consulta
-- correria como `anon`, que no tiene ninguna policy de SELECT sobre
-- dim_integrantes -- la landing quedaria vacía sin error visible. Que sea DEFINER
-- es justamente lo que permite exponer un subconjunto acotado sin abrirle la tabla
-- a nadie (mismo criterio de la 036 y la 040).

DROP VIEW IF EXISTS v_equipo_publico;
CREATE VIEW v_equipo_publico AS
SELECT
  id,
  nombre,
  especialidad AS role,
  bio_corta,
  bio,
  avatar_url AS photo,
  linkedin,
  portfolio,
  category
FROM dim_integrantes
WHERE activo = true
  AND visible_en_landing = true
  AND bio_corta IS NOT NULL
  AND avatar_url IS NOT NULL;

-- El DROP se lleva los grants con la vista vieja, así que este GRANT no es
-- redundante con el de la 040: sin el, /team pierde el acceso.
GRANT SELECT ON v_equipo_publico TO anon;

-- == 5 - Comprobacion =========================================================
-- Correr DESPUES de aplicar.
--
-- a) La columna existe y esta apagada para todos:
--      SELECT nombre, visible_en_landing FROM dim_integrantes ORDER BY nombre;
--
-- b) El GRANT columnar quedo (debe aparecer visible_en_landing, ahora 15 columnas):
--      SELECT column_name FROM information_schema.column_privileges
--       WHERE table_name = 'dim_integrantes' AND grantee = 'authenticated'
--         AND privilege_type = 'UPDATE'
--       ORDER BY column_name;
--
-- c) La vista muestra especialidad y solo a los encendidos (debe dar 0 filas
--    hasta que el dueño encienda a alguien):
--      SELECT * FROM v_equipo_publico;
--
-- d) La vista sigue siendo legible por anon y la tabla no:
--      SET ROLE anon;
--      SELECT count(*) FROM v_equipo_publico;   -- debe funcionar
--      SELECT count(*) FROM dim_integrantes;    -- debe fallar o dar 0
--      RESET ROLE;
--
-- e) El candado: un integrante que no es dueño no se puede publicar solo.
--    Desde la sesion de esa persona en la app, encender el switch tiene que
--    devolver 403 «Solo el administrador reparte accesos», no un 500.
