-- El borrado pasa de suave a real: la fila se va de la base.
--
-- La 026 dejaba `eliminado_at` marcado y el mensaje seguía visible como
-- "Mensaje eliminado". El señor Ignacio pidió que desaparezca de verdad.
--
-- Consecuencias, que vienen de las claves foráneas de la 026 y son deliberadas:
--   · `responder_a` es ON DELETE SET NULL → la respuesta que lo citaba sobrevive
--     y su cita muestra "Mensaje eliminado".
--   · `hilo_padre` es ON DELETE CASCADE → borrar el mensaje que abrió un hilo se
--     lleva todas sus respuestas. Un hilo sin su origen no se entiende.
--
-- La 019 no contemplaba borrar: `mensajes` no tenía policy de DELETE ni el GRANT
-- correspondiente. Sin esto la operación fallaba callada — RLS sin GRANT devuelve
-- 42501, y Postgres evalúa privilegios ANTES que las policies.

GRANT DELETE ON mensajes TO authenticated;

-- Cada uno borra lo suyo; el admin, cualquiera: si algo no debe estar en el chat
-- del equipo, alguien tiene que poder sacarlo.
DROP POLICY IF EXISTS "borrar mensaje propio o admin" ON mensajes;
CREATE POLICY "borrar mensaje propio o admin" ON mensajes FOR DELETE TO authenticated USING (autor_id = mi_integrante_id() OR EXISTS (SELECT 1 FROM dim_integrantes i WHERE i.id = mi_integrante_id() AND i.es_admin));

-- Los adjuntos del mensaje se van con él por el CASCADE de la 024, pero borrar
-- la fila padre exige poder borrar las hijas.
GRANT DELETE ON mensaje_adjuntos TO authenticated;

DROP POLICY IF EXISTS "borrar adjuntos de mi mensaje" ON mensaje_adjuntos;
CREATE POLICY "borrar adjuntos de mi mensaje" ON mensaje_adjuntos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM mensajes m WHERE m.id = mensaje_id AND (m.autor_id = mi_integrante_id() OR EXISTS (SELECT 1 FROM dim_integrantes i WHERE i.id = mi_integrante_id() AND i.es_admin))));
