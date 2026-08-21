-- Bug real reportado por Vicho: los cambios de foto en /settings ("Foto
-- para la web") nunca se reflejaban en tryvex.tech/team.
--
-- Causa: v_equipo_publico (065) exponía `avatar_url AS photo` — el avatar
-- interno del CRM (chat, sidebar), no la foto dedicada para la landing. La
-- columna real para eso es `foto_landing_url` (foto-landing-uploader.tsx la
-- llena por separado, con su propio comentario: "Avatar del CRM: es lo que
-- se publica cuando no hay foto de landing" — exactamente el fallback que
-- la vista nunca implementó).
--
-- No toca dim_integrantes, no borra datos. Solo cambia qué columna expone
-- la vista como `photo`.
DROP VIEW IF EXISTS v_equipo_publico;
CREATE VIEW v_equipo_publico AS
SELECT
  id,
  nombre,
  rol_principal AS role,
  bio_corta,
  bio,
  COALESCE(foto_landing_url, avatar_url) AS photo,
  linkedin,
  portfolio,
  category
FROM dim_integrantes
WHERE activo = true;

GRANT SELECT ON v_equipo_publico TO anon;
