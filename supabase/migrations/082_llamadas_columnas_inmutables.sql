-- La policy UPDATE de "llamadas" (033_llamadas.sql) deja tocar CUALQUIER
-- columna a cualquier miembro de la conversacion, no solo las de cerrar la
-- llamada (estado, contestada_at, terminada_at, motivo_fin). En la practica
-- la API server-side ya arma los updates de forma controlada, pero un
-- request directo a la REST podria reescribir conversacion_id o
-- iniciada_por. Bajo impacto (no filtra datos ajenos), pero sin motivo para
-- dejarlo abierto.

CREATE OR REPLACE FUNCTION proteger_columnas_llamada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.conversacion_id IS DISTINCT FROM OLD.conversacion_id
     OR NEW.iniciada_por IS DISTINCT FROM OLD.iniciada_por
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'columnas_llamada_inmutables';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_columnas_llamada ON llamadas;
CREATE TRIGGER proteger_columnas_llamada
  BEFORE UPDATE ON llamadas
  FOR EACH ROW
  EXECUTE FUNCTION proteger_columnas_llamada();
