-- Si la ultima llamada al lead fue contestada, para poder distinguir en el
-- tablero "le marque" de "hable con el negocio de verdad" sin abrir la ficha.
--
-- Por que existe: "contactado" (fact_leads.estado) ya avanza con SOLO
-- intentar el canal -- `esContacto()` en lib/types/lead.ts mira el TIPO de
-- interaccion, no si respondio. Eso es correcto para el embudo (una llamada
-- sin respuesta si cuenta como intento), pero deja a la tarjeta del tablero
-- sin forma de distinguir un lead que contesto de uno al que solo se le
-- marco sin suerte. Aditivo y nullable: NULL = nunca se le registro una
-- llamada.
ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS ultima_llamada_respondio BOOLEAN;
