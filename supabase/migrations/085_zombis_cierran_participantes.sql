-- Bug: `cerrar_llamadas_zombis` (033_llamadas.sql) cierra la fila de `llamadas`
-- pero nunca toca `llamada_participantes`. `LlamadasRepository.terminar()`
-- (lib/repos/llamadas.ts) si lo hace: junto con marcar la llamada 'terminada'
-- pasa a todos los participantes en 'en_llamada' a 'salio'. El barrido de
-- zombis es el otro camino que termina una llamada (navegador cerrado a mitad
-- de una llamada, nadie llama a terminar() a mano) y no seguia el mismo
-- patron: el participante quedaba 'en_llamada' para siempre.
--
-- Consecuencia real: cualquier lectura que se apoye en
-- `llamada_participantes.estado = 'en_llamada'` (contar quien esta en una
-- llamada, bloquear que alguien parezca estar en dos a la vez, metricas de
-- duracion) queda mintiendo despues de un cierre por zombi.
--
-- No se toca 033 (ya aplicada en prod) -- se reemplaza la funcion entera con
-- CREATE OR REPLACE, mismo nombre y firma para que el llamado existente en el
-- codigo (`cerrar_llamadas_zombis(conv_id)`) siga funcionando sin cambios.
CREATE OR REPLACE FUNCTION cerrar_llamadas_zombis(conv_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cerradas INTEGER;
BEGIN
  WITH zombis AS (
    UPDATE llamadas
       SET estado = 'terminada',
           terminada_at = NOW(),
           motivo_fin = COALESCE(motivo_fin, 'abandonada')
     WHERE conversacion_id = conv_id
       AND estado <> 'terminada'
       AND (
         -- Timbro dos minutos y nadie contesto: no va a contestar.
         (estado = 'sonando' AND created_at < NOW() - INTERVAL '2 minutes')
         -- Doce horas "en curso" no es una llamada larga, es una pestana olvidada.
         OR (estado = 'en_curso' AND COALESCE(contestada_at, created_at) < NOW() - INTERVAL '12 hours')
       )
    RETURNING id
  )
  -- Mismo patron que LlamadasRepository.terminar(): cerrar la llamada implica
  -- sacar del estado 'en_llamada' a quien seguia adentro segun la tabla.
  UPDATE llamada_participantes
     SET estado = 'salio',
         salio_at = NOW()
   WHERE llamada_id IN (SELECT id FROM zombis)
     AND estado = 'en_llamada';

  SELECT COUNT(*) INTO cerradas
    FROM llamadas
   WHERE conversacion_id = conv_id
     AND estado = 'terminada'
     AND terminada_at >= NOW() - INTERVAL '1 second';

  RETURN cerradas;
END $fn$;

REVOKE ALL ON FUNCTION cerrar_llamadas_zombis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cerrar_llamadas_zombis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cerrar_llamadas_zombis(UUID) TO service_role;
