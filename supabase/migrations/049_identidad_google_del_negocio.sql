-- El identificador único que Google le da a cada local, y su rubro real.
--
-- ## Por qué el identificador
--
-- Hoy un negocio se reconoce por (nombre_negocio, nicho). Por eso hay fichas
-- duplicadas: "Salon Regias" está dos veces, una como `peluquerías` y otra como
-- `centros de estética`. Es el MISMO local, con la misma dirección y el mismo
-- teléfono, contado dos veces en la cartera — y si alguien le escribe desde las
-- dos fichas, le llegan dos mensajes de Tryvex al mismo dueño.
--
-- Google le da a cada local un identificador que no cambia aunque le cambien el
-- nombre al negocio. Con eso el emparejamiento deja de depender de cómo se
-- escribió el nombre ese día.
--
-- ## Por qué el rubro real
--
-- `nicho` guarda lo que NOSOTROS buscamos ("barberías"), no lo que el negocio
-- es. Google dice cosas más precisas: "Barbería", "Peluquería masculina",
-- "Salón de belleza". Sirve para escribir más al grano sin inventar nada.
--
-- Idempotente: se puede correr dos veces.

ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS google_place_id  text,
  ADD COLUMN IF NOT EXISTS categoria_google text;

COMMENT ON COLUMN fact_leads.google_place_id IS
  'Identificador del local en Google Maps (par 0x...:0x... de la URL de la ficha). No cambia aunque cambie el nombre. NULL en las fichas anteriores a la migracion 049.';
COMMENT ON COLUMN fact_leads.categoria_google IS
  'El rubro que Google le pone al negocio, mas preciso que `nicho` (que guarda lo que buscamos nosotros).';

-- Único, pero solo donde el dato existe: las 538 fichas viejas lo tienen en
-- NULL y no pueden bloquearse entre ellas. Cuando el scraper vuelva a pasar por
-- un negocio ya guardado, este índice es lo que impide crear la ficha repetida.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_leads_google_place_id
  ON fact_leads (google_place_id)
  WHERE google_place_id IS NOT NULL;
