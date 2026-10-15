-- ============================================================
-- 053 — Más de un mensaje de WhatsApp por lead
--
-- El porqué: `uq_outreach_enviado` (migración 012) permite UNA sola fila
-- 'enviado' por (lead_id, canal). Se pensó para el primer contacto por la API
-- de Meta, cuando no existía conversación. Desde el buzón (migración 041) el
-- equipo conversa con el lead desde el CRM, y el segundo mensaje chocaba:
-- el puente lo mandaba, intentaba marcarlo 'enviado', el índice lo rechazaba
-- y la fila quedaba en 'enviando' para siempre. En el chat se veía el mensaje
-- repetido y con "enviando" eterno, como si no hubiera salido.
--
-- No se borra la protección: la ruta de Meta (app/api/vex/whatsapp/send) la
-- usa para no mandar dos veces el primer contacto. Se acota a esas filas, que
-- se reconocen porque no llevan `enviado_por`; las del buzón siempre lo
-- llevan (app/api/wa/send lo pone desde la sesión). Al ser un subconjunto de
-- lo que el índice anterior ya protegía, crearlo no puede fallar por datos
-- existentes.
--
-- Sentencias planas, sin bloques DO: el SQL Editor de Supabase corre todo en
-- una transacción y mutila esos bloques.
-- ============================================================

DROP INDEX IF EXISTS uq_outreach_enviado;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_primer_contacto_meta
  ON outreach_messages (lead_id, canal)
  WHERE estado = 'enviado' AND enviado_por IS NULL;

-- Filas que quedaron trabadas por el choque: el puente las mandó pero no pudo
-- marcarlas. Si su texto ya está en mensajes_wa (lo escribe el puente recién
-- cuando el mensaje salió), salieron de verdad: se cierran como 'enviado'.
UPDATE outreach_messages AS o
   SET estado = 'enviado',
       enviado_at = COALESCE(o.enviado_at, m.created_at)
  FROM mensajes_wa AS m
 WHERE o.estado = 'enviando'
   AND o.canal = 'whatsapp'
   AND m.lead_id = o.lead_id
   AND m.direccion = 'out'
   AND m.texto = o.texto
   AND m.created_at >= o.created_at;
