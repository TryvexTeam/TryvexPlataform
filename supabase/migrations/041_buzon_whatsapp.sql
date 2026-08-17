-- El buzon de salida de WhatsApp.
--
-- El CRM corre en Vercel y el puente escucha solo en 127.0.0.1 del VPS: desde
-- internet es inalcanzable, y por eso "Enviar desde el CRM" nunca funciono.
--
-- En vez de exponer el puente (puerto abierto, o un tunel de Cloudflare cuya
-- direccion cambia en cada reinicio — ya mordio dos veces la semana del 8-ago),
-- se da vuelta la llamada: el CRM ANOTA aca, y el puente lo PASA A BUSCAR.
-- Mismo patron que scraper_runs (040). Sin puerto abierto, sin direccion que se
-- mueva, y si el puente esta caido el mensaje queda encolado en vez de perderse.
--
-- Idempotente: se puede correr dos veces.

-- 1. Los estados que faltaban ------------------------------------------------
-- La tabla ya tenia 'borrador', 'enviado' y 'fallido', pero ninguno significa
-- "listo para mandar, todavia sin mandar" — que es lo unico que un buzon
-- necesita. 'borrador' no sirve: un borrador es algo que alguien todavia esta
-- escribiendo, no algo que ya se pidio mandar.
--
-- Y hace falta 'enviando' aparte de 'encolado': el puente tiene que reservar la
-- fila ANTES de mandar (si no, dos vueltas mandan el mismo mensaje dos veces y
-- eso no se deshace), pero marcarla 'enviado' en ese momento seria mentir —
-- todavia no salio. Una fila trabada en 'enviando' es visible y se puede
-- revisar; un mensaje duplicado a un cliente, no.
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_estado_check;
ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_estado_check
  CHECK (estado IN ('borrador', 'encolado', 'enviando', 'enviado', 'fallido'));

-- 2. Quien lo mando ----------------------------------------------------------
-- El puente ya escribe la atribucion en mensajes_wa.enviado_por; sin esta
-- columna, al pasar por el buzon ese dato se perdia en el camino.
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS enviado_por TEXT;

-- 3. Lo unico que el puente consulta -----------------------------------------
-- Indice parcial: la cola es corta y la tabla crece para siempre.
CREATE INDEX IF NOT EXISTS idx_outreach_encolados
  ON outreach_messages (created_at) WHERE estado = 'encolado';
