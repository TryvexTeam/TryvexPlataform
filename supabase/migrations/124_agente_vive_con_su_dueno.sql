-- Un agente puede pertenecer a un integrante: su token vale mientras esa persona
-- esté en el CRM. Desactivarla o desvincularla apaga el agente en el mismo
-- instante; si vuelve, el agente vuelve con ella.

ALTER TABLE agentes ADD COLUMN IF NOT EXISTS dueno_id UUID
  REFERENCES dim_integrantes(id) ON DELETE SET NULL;

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
    -- Solo sale de la sala de voz: en los chats de equipo su historial se conserva.
    DELETE FROM conversacion_miembros cm
     USING conversaciones c
     WHERE cm.conversacion_id = c.id AND c.tipo = 'voz' AND cm.integrante_id = NEW.id;
    UPDATE agentes SET activo = false WHERE dueno_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
