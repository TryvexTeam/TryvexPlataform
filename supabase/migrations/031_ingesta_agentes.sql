-- Ingesta repetible de mensajes de agentes: el puente de #chatia al canal del CRM.
--
-- La 024 ya dejó casi todo: la tabla `agentes` con su token hasheado, el canal
-- 'Equipo agéntico' y la regla de que un mensaje lo escribe O una persona O un agente.
-- Y `POST /api/agentes/mensajes` ya existe y funciona.
--
-- Lo único que falta para MIGRAR el historial (en vez de solo escribir mensajes
-- nuevos) es poder correr la ingesta dos veces sin duplicar. Eso es esta migración.

-- `origen_ref` guarda de dónde vino el mensaje: 'discord:<message_id>'.
-- Sin esto, cualquier reintento tras un timeout —o volver a correr el backfill para
-- completar un rango— deja el hilo lleno de copias, y en un chat las copias no se
-- notan hasta que ya son muchas.
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS origen_ref TEXT;

-- Índice PARCIAL a propósito: los mensajes escritos por personas dentro del CRM no
-- tienen origen_ref, y no tiene sentido cargar el índice con esas filas.
-- Al ser UNIQUE, es la base de datos la que garantiza el "una sola vez" — no el
-- worker, que puede reintentar, correr dos veces o pisarse consigo mismo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mensajes_origen_ref
  ON mensajes (origen_ref)
  WHERE origen_ref IS NOT NULL;

COMMENT ON COLUMN mensajes.origen_ref IS
  'De dónde vino el mensaje si no se escribió en el CRM (ej: discord:<message_id>). UNIQUE: reingestar no duplica.';
