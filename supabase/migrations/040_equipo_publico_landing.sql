-- Conectar el perfil del integrante (CRM) con la seccion "equipo" de la landing.
--
-- Antes: la landing tenia el equipo hardcodeado en un array TS. Ahora un
-- integrante activo edita su foto/bio desde /settings y eso aparece solo en
-- tryvex.tech, sin tocar codigo ni redeploy manual del equipo.
--
-- Dos piezas:
--   1. Columnas nuevas en dim_integrantes -- lo que la landing necesita y que
--      "especialidad" (una linea, pensada para uso interno) no cubre.
--   2. Una VISTA publica, no la tabla. anon nunca toca dim_integrantes: expone
--      solo las columnas aptas para landing, y solo activo = true. La vista
--      corre con los permisos de quien la crea (dueno bypassa su propia RLS),
--      asi que no hace falta una policy nueva en la tabla para esto.
--
-- Ver 036_limpiar_policies_invitaciones.sql: en esta base, cualquier exposicion
-- a `anon` se hace explicita y deliberada, nunca por descuido.

ALTER TABLE dim_integrantes
  ADD COLUMN IF NOT EXISTS bio_corta TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS portfolio TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'core'
    CHECK (category IN ('core', 'engineering'));

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

-- Comprobacion -- debe devolver las columnas de arriba, cero filas de mas:
--   SELECT * FROM v_equipo_publico;
-- Comprobacion de que la tabla real sigue cerrada a anon:
--   SET ROLE anon; SELECT * FROM dim_integrantes; -- debe fallar o devolver 0 filas
