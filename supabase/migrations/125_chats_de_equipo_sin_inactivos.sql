-- Quien pierde el acceso al CRM sale de TODAS las conversaciones de equipo (no
-- solo de la sala de voz): seguía figurando como integrante de "Equipo Tryvex".
-- Si vuelve como activo, el trigger lo reincorpora y ve el historial completo.

CREATE OR REPLACE FUNCTION sincronizar_integrante_activo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.activo AND (TG_OP = 'INSERT' OR NOT OLD.activo) THEN
    INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
    SELECT id, NEW.id FROM conversaciones WHERE de_equipo
    ON CONFLICT DO NOTHING;
    UPDATE agentes SET activo = true WHERE dueno_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND OLD.activo AND NOT NEW.activo THEN
    UPDATE jornadas
       SET salida_at = GREATEST(NOW(), entrada_at + INTERVAL '1 second')
     WHERE integrante_id = NEW.id AND salida_at IS NULL;
    DELETE FROM conversacion_miembros cm
     USING conversaciones c
     WHERE cm.conversacion_id = c.id AND c.de_equipo AND cm.integrante_id = NEW.id;
    UPDATE agentes SET activo = false WHERE dueno_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DELETE FROM conversacion_miembros cm
 USING conversaciones c, dim_integrantes i
 WHERE cm.conversacion_id = c.id AND c.de_equipo
   AND cm.integrante_id = i.id AND NOT i.activo;
