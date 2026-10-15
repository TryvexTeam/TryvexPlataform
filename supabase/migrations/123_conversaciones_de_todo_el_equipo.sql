-- "Equipo Tryvex" (grupo) y "Equipo agéntico" se llenaron una sola vez, como la
-- sala de voz: quien llegó después no los veía. Se marcan como conversaciones
-- de todo el equipo y el trigger de la 122 las mantiene por esa marca.

ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS de_equipo BOOLEAN NOT NULL DEFAULT false;

UPDATE conversaciones SET de_equipo = true
 WHERE tipo = 'voz'
    OR (tipo = 'agentes' AND nombre = 'Equipo agéntico')
    OR (tipo = 'grupo' AND nombre = 'Equipo Tryvex');

CREATE OR REPLACE FUNCTION sincronizar_integrante_activo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.activo AND (TG_OP = 'INSERT' OR NOT OLD.activo) THEN
    INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
    SELECT id, NEW.id FROM conversaciones WHERE de_equipo
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.activo AND NOT NEW.activo THEN
    UPDATE jornadas
       SET salida_at = GREATEST(NOW(), entrada_at + INTERVAL '1 second')
     WHERE integrante_id = NEW.id AND salida_at IS NULL;
    -- Solo sale de la sala de voz: en los chats de equipo su historial se conserva.
    DELETE FROM conversacion_miembros cm
     USING conversaciones c
     WHERE cm.conversacion_id = c.id AND c.tipo = 'voz' AND cm.integrante_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
SELECT c.id, i.id FROM conversaciones c CROSS JOIN dim_integrantes i
 WHERE c.de_equipo AND i.activo
ON CONFLICT DO NOTHING;
