-- ============================================================
-- 052 — Autoría real de los mensajes a leads
--
-- Contexto (PRP-008, fase 2):
--   `mensajes_wa.enviado_por` y `outreach_messages.enviado_por` son TEXTO
--   LIBRE que llega desde el navegador. Hoy contienen "Equipo" (5 de 6
--   mensajes salientes), "Ignacio", "Vex" y null. Con "Equipo" es imposible
--   saber quién habló.
--
--   El señor Ignacio lo definió el 2026-08-18: debe constar el nombre del
--   integrante real, y el mensaje se asocia a su usuario.
--
--   Se agrega `integrante_id` como FK real. `enviado_por` se conserva como
--   etiqueta legible (y para el bot Vex, que no es un integrante), pero deja
--   de ser la fuente de verdad: la identidad la resuelve el servidor desde la
--   sesión autenticada, nunca el cliente.
-- ============================================================

ALTER TABLE mensajes_wa
  ADD COLUMN IF NOT EXISTS integrante_id UUID
    REFERENCES dim_integrantes(id) ON DELETE SET NULL;

ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS integrante_id UUID
    REFERENCES dim_integrantes(id) ON DELETE SET NULL;

-- Índices: la pregunta del dashboard es "a qué leads contactó esta persona".
CREATE INDEX IF NOT EXISTS mensajes_wa_integrante_idx
  ON mensajes_wa(integrante_id) WHERE integrante_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_messages_integrante_idx
  ON outreach_messages(integrante_id) WHERE integrante_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- Backfill de lo que SÍ se puede recuperar
-- ─────────────────────────────────────────────────────────────
-- `outreach_messages.aprobado_por` ya guarda el integrante autenticado que
-- encoló el mensaje: ese dato es confiable y se copia tal cual.
UPDATE outreach_messages
   SET integrante_id = aprobado_por
 WHERE integrante_id IS NULL
   AND aprobado_por IS NOT NULL;

-- En `mensajes_wa` solo se puede recuperar donde el texto coincide exactamente
-- con el nombre de pila de un integrante activo y ese nombre no es ambiguo.
-- Los mensajes marcados "Equipo" quedan sin autor: no hay forma de saber quién
-- fue, e inventarlo sería peor que dejarlo nulo.
UPDATE mensajes_wa m
   SET integrante_id = i.id
  FROM dim_integrantes i
 WHERE m.integrante_id IS NULL
   AND m.es_bot IS NOT TRUE
   AND m.enviado_por IS NOT NULL
   AND split_part(i.nombre, ' ', 1) = m.enviado_por
   AND i.activo
   AND (
     SELECT count(*) FROM dim_integrantes d
      WHERE d.activo AND split_part(d.nombre, ' ', 1) = m.enviado_por
   ) = 1;
