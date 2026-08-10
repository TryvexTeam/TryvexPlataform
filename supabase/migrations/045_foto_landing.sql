-- La foto que se publica en tryvex.tech/team deja de ser, obligatoriamente, el
-- avatar del CRM.
--
-- El problema real: `avatar_url` se sube pensando en el chat, donde la foto se
-- pinta a 32px al costado de cada mensaje. Ahí una imagen chica o recomprimida se
-- ve perfecta. En la landing esa misma imagen se muestra grande y se nota
-- pixelada, y el que lo descubre es un cliente mirando la web de la empresa.
--
-- La solución son dos piezas complementarias, y ninguna sirve sola:
--   · Esta columna: permite subir una foto aparte, en buena resolución, sin tocar
--     el avatar que ya funciona bien en el chat.
--   · La validación de 400x400 px en /api/perfil/foto-landing: avisa en el momento
--     de subirla, no cuando ya está publicada.
--
-- ORDEN DE APLICACIÓN: la 044 (visibilidad en la landing) tiene que estar aplicada
-- ANTES que esta. Acá se recrea `v_equipo_publico` sobre la versión de la 044
-- (`especialidad AS role`, `visible_en_landing`); si se aplica esta primero, la
-- 044 la volvería a pisar y se perdería la foto de landing.

-- == 1 - La columna ===========================================================
-- Nullable a propósito: subir foto de landing es opcional. Quien no la sube sigue
-- publicándose con su avatar, que es exactamente el comportamiento de hoy.

ALTER TABLE dim_integrantes
  ADD COLUMN IF NOT EXISTS foto_landing_url TEXT;

-- == 2 - El GRANT columnar ====================================================
-- IMPRESCINDIBLE. La 042 hizo REVOKE UPDATE sobre toda la tabla y devolvió el
-- privilegio solo sobre columnas nombradas una por una. Una columna nueva NO
-- hereda nada: sin esta línea la subida falla en runtime con «42501 permission
-- denied for column foto_landing_url», y ningún test de tipos, lint ni build lo
-- detecta -- se descubre recién con una persona intentando subir su foto.

GRANT UPDATE (foto_landing_url) ON dim_integrantes TO authenticated;

-- == 3 - La vista pública =====================================================
-- Idéntica a la de la 044 salvo por una sola línea: la columna `photo` pasa de
-- `avatar_url` a `COALESCE(foto_landing_url, avatar_url)`. Es decir: la foto de
-- landing si existe, y el avatar del CRM si no. La landing no se entera del
-- cambio, sigue leyendo `photo`.
--
-- El filtro sigue siendo `avatar_url IS NOT NULL` y no el COALESCE: la foto de
-- landing es un extra opcional, no un requisito nuevo para aparecer. Quien hoy
-- está publicado sigue publicado.
--
-- Deliberadamente SIN `security_invoker = true`: la vista tiene que seguir siendo
-- SECURITY DEFINER. RLS filtra filas, no columnas, y con invoker la consulta
-- correría como `anon`, que no tiene ninguna policy de SELECT sobre
-- dim_integrantes -- la landing quedaría vacía sin error visible. El linter de
-- Supabase avisa de esto; el aviso es esperado y NO hay que "arreglarlo" (mismo
-- criterio de la 036, la 040 y la 044).

DROP VIEW IF EXISTS v_equipo_publico;
CREATE VIEW v_equipo_publico AS
SELECT
  id,
  nombre,
  especialidad AS role,
  bio_corta,
  bio,
  COALESCE(foto_landing_url, avatar_url) AS photo,
  linkedin,
  portfolio,
  category
FROM dim_integrantes
WHERE activo = true
  AND visible_en_landing = true
  AND bio_corta IS NOT NULL
  AND avatar_url IS NOT NULL;

-- El DROP se lleva los grants con la vista vieja: sin este GRANT, /team pierde el
-- acceso y la landing queda sin equipo.
GRANT SELECT ON v_equipo_publico TO anon;

-- == 4 - Comprobación =========================================================
-- Correr DESPUÉS de aplicar.
--
-- a) La columna existe:
--      SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'dim_integrantes' AND column_name = 'foto_landing_url';
--
-- b) El GRANT columnar quedó (debe aparecer foto_landing_url en la lista):
--      SELECT column_name FROM information_schema.column_privileges
--       WHERE table_name = 'dim_integrantes' AND grantee = 'authenticated'
--         AND privilege_type = 'UPDATE'
--       ORDER BY column_name;
--
-- c) La vista prefiere la foto de landing y cae al avatar cuando no hay:
--      SELECT nombre, photo FROM v_equipo_publico ORDER BY nombre;
--      SELECT nombre, foto_landing_url, avatar_url FROM dim_integrantes
--       WHERE visible_en_landing = true ORDER BY nombre;
--    (para cada fila, photo debe ser foto_landing_url si no es NULL, si no avatar_url)
--
-- d) La vista sigue siendo legible por anon y la tabla no:
--      SET ROLE anon;
--      SELECT count(*) FROM v_equipo_publico;   -- debe funcionar
--      SELECT count(*) FROM dim_integrantes;    -- debe fallar o dar 0
--      RESET ROLE;
--
-- e) La subida real, que es lo único que prueba el GRANT: desde /settings subir
--    una foto de landing tiene que devolver 200 y verse en tryvex.tech/team en
--    segundos. Un 500 con «permission denied for column» significa que este
--    archivo se aplicó a medias.
