-- El chat con un lead no puede chocar con la idempotencia del primer contacto.
--
-- `uq_outreach_enviado` existe desde la 012 con un propósito correcto: que el
-- mensaje de apertura no se mande dos veces al mismo lead. Un índice único
-- sobre (lead_id, canal) donde estado = 'enviado'.
--
-- Pero `outreach_messages` terminó guardando DOS cosas distintas:
--   1. El primer contacto — uno por lead, y por eso el índice
--   2. Cada mensaje del chat del CRM — muchos por lead, por definición
--
-- Mientras los mensajes del chat quedaban en estado 'encolado' esperando al
-- puente, nunca chocaban. Al pasar el transporte al agente empezaron a marcarse
-- 'enviado', y el segundo mensaje a un mismo lead reventaba con 500:
--
--   duplicate key value violates unique constraint "uq_outreach_enviado"
--
-- Verificado en produccion: un lead con 1 'enviado' y 5 'encolado' — el primero
-- paso y los siguientes rebotaron.
--
-- La solución no es quitar el índice, que sigue haciendo falta. Es marcar cuál
-- de las dos cosas es cada fila, y aplicar la unicidad solo a la que la
-- necesita.

-- Qué es esta fila. 'primer_contacto' por defecto: es lo que había antes de que
-- existiera el chat, y así las filas viejas conservan su significado.
ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'primer_contacto'
  CHECK (tipo IN ('primer_contacto', 'chat'));

COMMENT ON COLUMN outreach_messages.tipo IS
  'primer_contacto: el mensaje de apertura, uno solo por lead y canal. chat: un mensaje mas de una conversacion ya abierta, sin limite.';

-- El índice nuevo solo cubre el primer contacto. Se crea ANTES de borrar el
-- viejo para no dejar ni un instante sin la protección: entre un DROP y un
-- CREATE cabe un envío duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_primer_contacto
  ON outreach_messages (lead_id, canal)
  WHERE estado = 'enviado' AND tipo = 'primer_contacto';

DROP INDEX IF EXISTS uq_outreach_enviado;

COMMENT ON INDEX public.uq_outreach_primer_contacto IS
  'Idempotencia del primer contacto: un solo mensaje de apertura enviado por lead y canal. Los mensajes de chat quedan fuera a proposito — una conversacion tiene muchos.';

-- Buscar el hilo de un lead es lo que hace la ficha cada vez que se abre.
CREATE INDEX IF NOT EXISTS idx_outreach_lead_tipo
  ON outreach_messages (lead_id, tipo, created_at DESC);
