-- Teléfonos de integrantes en E.164 (+56XXXXXXXXX).
--
-- El porqué: los teléfonos se cargaron a mano y quedaron en tres estados distintos
-- ("+56929159103", "920394617", vacío). El botón de "llamar al celular" arma un
-- `tel:` con lo que haya en la columna, y `tel:920394617` no marca: el usuario toca
-- y no pasa nada, sin error visible. Un formato mixto en la base es un botón roto en
-- la ficha.
--
-- Dos partes: limpiar lo que ya está, y un CHECK para que no vuelva a ensuciarse.
-- La validación de la app (lib/telefono.ts) usa exactamente el mismo criterio; el
-- CHECK es la red de abajo, para lo que entre por SQL directo o por un script.
--
-- Nota para el SQL Editor de Supabase: todo esto son sentencias planas a propósito.
-- Sin bloques DO encadenados y sin dollar-quoting, porque el editor corre el script
-- completo en una sola transacción y mutila esos bloques.

-- ══ 1 · Normalizar lo existente ══════════════════════════════════════════════
-- El pipeline es el mismo que en TypeScript, en tres capas de subconsulta:
--   z         = solo dígitos, sin ceros de salida a la izquierda ("0", "00")
--   nacional  = z sin el prefijo de país, si venía con él (11 dígitos que parten en 56)
--   telefono  = '+56' || nacional, solo si el nacional es un número chileno real
--
-- Lo que no calza queda NULL. Es deliberado: un teléfono vacío se ve vacío en la
-- ficha y alguien lo corrige; un teléfono inventado (completarle un dígito a un
-- número de 8) marca a un desconocido y nadie se entera.
UPDATE dim_integrantes AS i
SET telefono = CASE
    WHEN c.nacional ~ '^[2-9][0-9]{8}$' THEN '+56' || c.nacional
    ELSE NULL
  END
FROM (
  SELECT
    t.id,
    -- Chile usa 9 dígitos nacionales: el primero es 9 (móvil) o 2 (fija Santiago).
    CASE
      WHEN length(t.z) = 11 AND left(t.z, 2) = '56' THEN substr(t.z, 3)
      ELSE t.z
    END AS nacional
  FROM (
    SELECT
      id,
      regexp_replace(
        regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g'),
        '^0+', ''
      ) AS z
    FROM dim_integrantes
  ) AS t
) AS c
WHERE i.id = c.id;

-- ══ 2 · Impedir que vuelva a ensuciarse ══════════════════════════════════════
-- NULL sigue permitido: hay integrantes que legítimamente no tienen teléfono
-- cargado, y obligarlos a inventar uno sería peor que la columna vacía. Lo que se
-- prohíbe es el punto medio: un texto que parece teléfono y no se puede marcar.
ALTER TABLE dim_integrantes
  DROP CONSTRAINT IF EXISTS telefono_e164_cl;

ALTER TABLE dim_integrantes
  ADD CONSTRAINT telefono_e164_cl
  CHECK (telefono IS NULL OR telefono ~ '^\+56[2-9][0-9]{8}$');

COMMENT ON COLUMN dim_integrantes.telefono IS
  'Teléfono en E.164 chileno (+56 + 9 dígitos nacionales) o NULL. Se usa directo en tel: y wa.me, por eso el formato es obligatorio y no cosmético. Normalizar siempre con normalizarTelefonoCL() de lib/telefono.ts.';
