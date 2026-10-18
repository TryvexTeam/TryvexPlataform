-- app/api/agentes/eventos/route.ts deduplicaba reintentos de agente con un
-- SELECT (eventoYaExiste) seguido de un INSERT separado: si dos reintentos
-- llegaban a la vez, ambos podían pasar el SELECT antes de que el primero
-- terminara el INSERT, y el evento quedaba agendado dos veces (carrera
-- TOCTOU). El mismo problema que resolvió el unique parcial de
-- outreach_messages (lead_id, canal) para el envío de WhatsApp.
--
-- titulo+inicio ya era la clave de deduplicación asumida por el código
-- (comentario de eventoYaExiste: "para una cita es única"); este constraint
-- solo hace que Postgres la haga cumplir de verdad en vez de confiar en el
-- SELECT previo.
CREATE UNIQUE INDEX IF NOT EXISTS eventos_titulo_inicio_unico
  ON eventos (titulo, inicio);
