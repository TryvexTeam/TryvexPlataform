-- El chat pasa de "lista de mensajes" a conversación de verdad: se puede
-- responder a uno puntual, abrir un hilo colgado de un mensaje, y borrar.
--
-- Sin format() ni DO encadenados, y cada policy en una línea: el SQL Editor de
-- Supabase mutila ambas formas (42601) y corre todo en una transacción, así que
-- un error en la línea 40 revierte lo de la línea 1. Lección de la 022/023/024.

-- ── Responder a un mensaje puntual ────────────────────────────────────────
-- ON DELETE SET NULL y no CASCADE: si se borra el mensaje citado, la respuesta
-- sigue teniendo sentido por sí sola. Borrarla también sería perder conversación.
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS responder_a UUID REFERENCES mensajes(id) ON DELETE SET NULL;

-- ── Hilos ─────────────────────────────────────────────────────────────────
-- Un hilo cuelga del mensaje que lo abrió. Los mensajes con `hilo_padre` no
-- aparecen en el flujo principal: viven dentro de su hilo, como en Slack.
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS hilo_padre UUID REFERENCES mensajes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mensajes_hilo ON mensajes (hilo_padre, created_at) WHERE hilo_padre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mensajes_principales ON mensajes (conversacion_id, created_at DESC) WHERE hilo_padre IS NULL;

-- Un hilo no puede colgar de un mensaje que ya es respuesta de otro hilo: un
-- solo nivel, como Slack. Anidar sin límite hace la conversación ilegible.
CREATE OR REPLACE FUNCTION hilo_de_un_solo_nivel()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.hilo_padre IS NOT NULL AND EXISTS (SELECT 1 FROM mensajes WHERE id = NEW.hilo_padre AND hilo_padre IS NOT NULL) THEN
    RAISE EXCEPTION 'hilo_anidado' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_hilo_un_nivel ON mensajes;
CREATE TRIGGER trg_hilo_un_nivel BEFORE INSERT ON mensajes FOR EACH ROW EXECUTE FUNCTION hilo_de_un_solo_nivel();

-- ── Borrado ───────────────────────────────────────────────────────────────
-- Es borrado suave: se marca `eliminado_at` (columna que la 019 dejó lista y
-- nadie usaba). Así la respuesta que citaba ese mensaje no queda huérfana, y
-- queda rastro de que hubo algo — un mensaje que desaparece sin dejar hueco es
-- peor que uno tachado.
-- La 019 solo dejaba editar el mensaje propio. El admin puede borrar cualquiera:
-- si algo no debe estar en el chat del equipo, alguien tiene que poder sacarlo.
--
-- Sin función `soy_admin()` a propósito: el chequeo va inline. Una función más
-- es una sentencia más para que el SQL Editor mutile, y acá no aporta nada —
-- `mi_integrante_id()` ya es SECURITY DEFINER y resuelve quién soy sin recursión.
DROP POLICY IF EXISTS "editar mensaje propio" ON mensajes;
CREATE POLICY "editar mensaje propio" ON mensajes FOR UPDATE TO authenticated USING (autor_id = mi_integrante_id() OR EXISTS (SELECT 1 FROM dim_integrantes i WHERE i.id = mi_integrante_id() AND i.es_admin)) WITH CHECK (autor_id = mi_integrante_id() OR EXISTS (SELECT 1 FROM dim_integrantes i WHERE i.id = mi_integrante_id() AND i.es_admin));
