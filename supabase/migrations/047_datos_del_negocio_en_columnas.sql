-- Los datos del negocio salen de `notas` y pasan a columnas propias.
--
-- Por qué existe: el scraper ya extrae la calificación de Google, las reseñas y
-- el horario, y el mapeo los guarda TODOS concatenados dentro de `notas`, como
-- texto suelto:
--
--   'Rating Google: 4.8 · Reseñas: 48 · Horario: Abierto · Cierra a las 7 p. m.
--    · Dirección: Salvador Sanfuentes 2176, 8370066 Santiago, Región Metropolitana'
--
-- Consecuencias de tenerlos ahí:
--
--  1. Nadie puede filtrar. La lista más valiosa que tiene el equipo —"negocios
--     con buena reputación, con Instagram y sin web"— es imposible de pedir por
--     SQL contra un campo de texto libre.
--  2. Vex no los usa. Y cuando por fin le llegó uno crudo (`info_texto`), lo
--     interpretó mal: convirtió "4,8 (256)" en "256 personas buscan barberías
--     como la tuya cada semana". Un dato sin etiqueta es material para inventar.
--  3. El dato ya venía limpio y separado desde el scraper (`rating`,
--     `num_resenas`, `horario`): se aplastaba a propósito en una sola línea.
--
-- No hace falta volver a raspar Maps: todo esto ya está en la base. Es leerlo
-- una vez y guardarlo donde sirva.
--
-- Idempotente: se puede correr dos veces.

-- 1. Las columnas ----------------------------------------------------------
ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS google_rating  numeric(2,1),
  ADD COLUMN IF NOT EXISTS google_resenas integer,
  ADD COLUMN IF NOT EXISTS horario        text,
  ADD COLUMN IF NOT EXISTS instagram      text;

COMMENT ON COLUMN fact_leads.google_rating  IS 'Calificación en Google Maps (1.0 a 5.0). NULL = no la sabemos.';
COMMENT ON COLUMN fact_leads.google_resenas IS 'Cuántas reseñas sostienen esa calificación. NULL = no lo sabemos.';
COMMENT ON COLUMN fact_leads.horario        IS 'Horario tal como lo muestra Maps. Es una foto del momento del scraping, no un calendario.';
COMMENT ON COLUMN fact_leads.instagram      IS 'URL del perfil de Instagram, si el negocio lo publica.';

-- Una calificación fuera de rango es un error de lectura, no un dato.
ALTER TABLE fact_leads DROP CONSTRAINT IF EXISTS fact_leads_google_rating_check;
ALTER TABLE fact_leads ADD CONSTRAINT fact_leads_google_rating_check
  CHECK (google_rating IS NULL OR (google_rating >= 1 AND google_rating <= 5));

ALTER TABLE fact_leads DROP CONSTRAINT IF EXISTS fact_leads_google_resenas_check;
ALTER TABLE fact_leads ADD CONSTRAINT fact_leads_google_resenas_check
  CHECK (google_resenas IS NULL OR google_resenas >= 0);

-- 2. Rescatar lo que ya está guardado ---------------------------------------
--
-- 🔴 La calificación y las reseñas se leen de `info_texto`, NO de `notas`.
--
-- El número de reseñas de `notas` está MAL en las 510 filas que lo tienen: es
-- la calificación multiplicada por diez, sin una sola excepción. Ejemplos
-- reales contra el crudo de Maps que guarda `info_texto`:
--
--   Galindo       -> reseñas reales 7885, en `notas` dice 43
--   Café Jardín   -> reales 362,          en `notas` dice 45
--   Peluquería... -> reales 22,           en `notas` dice 48
--
-- La causa está en `scraper/scraper.py`, `extraer_num_resenas`: lee el
-- `aria-label` del span de la calificación ("4,3 estrellas"), le saca los
-- dígitos y se queda con "43". El selector apunta al elemento equivocado.
--
-- Importa más de lo que parece: ese número iba a salir escrito en un mensaje a
-- un cliente ("tienes 4,3 estrellas con 43 reseñas") cuando el negocio tiene
-- 7.885. Es exactamente la clase de dato falso que estamos sacando del sistema.
--
-- `info_texto` trae el crudo de la ficha: '4,3\n(7885)' — a veces con el rango
-- de precios pegado ('·CLP 10-20 k'), que se ignora.
--
-- Solo se tocan las filas que todavía no tienen el dato: correrla de nuevo no
-- pisa nada que alguien haya corregido a mano.
UPDATE fact_leads
SET google_rating = NULLIF(replace(substring(info_texto from '^\s*([0-9](?:[.,][0-9])?)'), ',', '.'), '')::numeric
WHERE google_rating IS NULL
  AND info_texto ~ '^\s*[0-9]([.,][0-9])?\s*\(';

UPDATE fact_leads
SET google_resenas = NULLIF(replace(replace(substring(info_texto from '\(\s*([0-9][0-9.,]*)\s*\)'), '.', ''), ',', ''), '')::integer
WHERE google_resenas IS NULL
  AND info_texto ~ '\(\s*[0-9]';

-- El horario sí sale de `notas`, que es donde el mapeo lo dejó. Va entre
-- 'Horario:' y la dirección; el `.` de Postgres cruza saltos de línea, así que
-- se corta explícitamente en 'Direcci' y se limpian los separadores del final.
UPDATE fact_leads
SET horario = NULLIF(regexp_replace(substring(notas from 'Horario:\s*(.*?)\s*(?:·\s*)?Direcci'), '^[\s·]+|[\s·]+$', '', 'g'), '')
WHERE horario IS NULL
  AND notas ~ 'Horario:\s*\S';

-- 3. Instagram, desde el campo de redes -------------------------------------
-- `redes_sociales` guarda `{"origen_texto": "url1, url2"}`, y muchas veces la
-- misma URL repetida. Se toma la primera de Instagram y se le sacan los
-- parámetros de seguimiento (?igshid=...), que no aportan y ensucian.
UPDATE fact_leads
SET instagram = split_part(
      substring(redes_sociales->>'origen_texto' from '(https?://(?:www\.)?instagram\.com/[A-Za-z0-9_.]+)'),
      '?', 1
    )
WHERE instagram IS NULL
  AND redes_sociales->>'origen_texto' ~* 'instagram\.com/';

-- 4. Que buscar por estos datos sea barato ----------------------------------
-- "Negocios con buena reputación y sin web" es la consulta que justifica todo
-- esto; sin índice es un scan de la tabla entera cada vez.
CREATE INDEX IF NOT EXISTS idx_fact_leads_reputacion
  ON fact_leads (google_rating DESC NULLS LAST, google_resenas DESC NULLS LAST)
  WHERE tiene_web IS NOT TRUE;
