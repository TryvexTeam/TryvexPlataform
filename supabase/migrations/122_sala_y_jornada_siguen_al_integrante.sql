-- La sala de voz y la jornada siguen el estado del integrante.
--
-- 1) La "Sala del equipo" se llenó una sola vez, en la 033: quien llegó después
--    no la veía. Ahora entrar (o volver) como activo te mete en toda sala de voz.
-- 2) Desvincular o desactivar a alguien dejaba su jornada abierta contando horas
--    hasta que pasaba el cron diario. Ahora se cierra en el mismo instante.
-- 3) Las bienvenidas ya enviadas llevaban el nombre escrito: pasan a plantilla
--    {nombre:<id>} para que muestren el nombre actual del integrante.

CREATE OR REPLACE FUNCTION sincronizar_integrante_activo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.activo AND (TG_OP = 'INSERT' OR NOT OLD.activo) THEN
    INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
    SELECT id, NEW.id FROM conversaciones WHERE tipo = 'voz'
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.activo AND NOT NEW.activo THEN
    UPDATE jornadas
       SET salida_at = GREATEST(NOW(), entrada_at + INTERVAL '1 second')
     WHERE integrante_id = NEW.id AND salida_at IS NULL;
    DELETE FROM conversacion_miembros cm
     USING conversaciones c
     WHERE cm.conversacion_id = c.id AND c.tipo = 'voz' AND cm.integrante_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_integrante_activo ON dim_integrantes;
CREATE TRIGGER trg_integrante_activo
  AFTER INSERT OR UPDATE OF activo ON dim_integrantes
  FOR EACH ROW EXECUTE FUNCTION sincronizar_integrante_activo();

-- Puesta al día: activos que faltan en la sala, inactivos que sobran.
INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
SELECT c.id, i.id FROM conversaciones c CROSS JOIN dim_integrantes i
 WHERE c.tipo = 'voz' AND i.activo
ON CONFLICT DO NOTHING;

DELETE FROM conversacion_miembros cm
 USING conversaciones c, dim_integrantes i
 WHERE cm.conversacion_id = c.id AND c.tipo = 'voz'
   AND cm.integrante_id = i.id AND NOT i.activo;

-- Jornadas abiertas de inactivos: se cierran cuando dejaron de estar, no ahora.
UPDATE jornadas j
   SET salida_at = GREATEST(COALESCE(i.desvinculado_at, NOW()), j.entrada_at + INTERVAL '1 second')
  FROM dim_integrantes i
 WHERE j.integrante_id = i.id AND NOT i.activo AND j.salida_at IS NULL;

-- Bienvenidas ya enviadas → plantilla con el id del recién llegado.
UPDATE mensajes m
   SET contenido = '¡Bienvenido/a a Tryvex, {nombre:' || b.nuevo_id || '}! 👋'
  FROM bienvenidas b, conversaciones c
 WHERE m.conversacion_id = c.id AND c.tipo = 'dm'
   AND m.autor_id = b.de_id
   AND m.contenido ~ '^¡Bienvenido/a a Tryvex, [^{}]*! 👋$'
   AND EXISTS (SELECT 1 FROM conversacion_miembros cm
                WHERE cm.conversacion_id = c.id AND cm.integrante_id = b.nuevo_id);
