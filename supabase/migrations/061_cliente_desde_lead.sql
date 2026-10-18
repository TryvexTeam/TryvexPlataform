-- De qué lead salió un cliente.
--
-- Ganar un lead pasa a crear su ficha de cliente automáticamente. Sin esta
-- columna no habría forma de saber que ya se convirtió, y volver a marcarlo
-- como ganado —o arrastrarlo dos veces en el tablero— crearía un cliente
-- duplicado cada vez.
--
-- UNIQUE es lo que hace la conversión idempotente: la segunda vez choca contra
-- la restricción en vez de duplicar. NULL no cuenta para UNIQUE en Postgres,
-- así que los clientes dados de alta a mano conviven sin estorbarse.

ALTER TABLE dim_clientes
  ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES fact_leads(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_lead_unico
  ON dim_clientes (lead_id)
  WHERE lead_id IS NOT NULL;
