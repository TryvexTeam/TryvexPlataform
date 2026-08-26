-- Bug reportado: "Varias llamadas quedan en cola, a pesar de haber sido
-- finalizadas."
--
-- `cerrar_llamadas_zombis(conv_id UUID)` (033, reforzada en 085) solo barre
-- las zombis de UNA conversacion, y solo se llama reactivamente desde
-- `LlamadasRepository.viva(conversacionId)` -- es decir, solo cuando alguien
-- vuelve a esa conversacion e intenta ver/iniciar una llamada ahi. Si nadie
-- vuelve a abrir ese hilo, la llamada zombi (navegador cerrado a mitad de
-- una llamada, o timbrando sin que nadie conteste) se queda con
-- estado <> 'terminada' para siempre, sin importar cuanto tiempo pase --
-- nada la barre nunca.
--
-- Se agrega un barrido GLOBAL, mismo criterio exacto que el barrido por
-- conversacion (timbrando 2+ minutos sin contestar, o "en curso" 12+ horas
-- sin que nadie la termine a mano), para que las llamadas fantasma se
-- cierren solas aunque nadie vuelva a esa conversacion.
CREATE OR REPLACE FUNCTION cerrar_llamadas_zombis_global()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cerradas INTEGER;
BEGIN
  WITH zombis AS (
    UPDATE llamadas
       SET estado = 'terminada',
           terminada_at = NOW(),
           motivo_fin = COALESCE(motivo_fin, 'abandonada')
     WHERE estado <> 'terminada'
       AND (
         (estado = 'sonando' AND created_at < NOW() - INTERVAL '2 minutes')
         OR (estado = 'en_curso' AND COALESCE(contestada_at, created_at) < NOW() - INTERVAL '12 hours')
       )
    RETURNING id
  )
  UPDATE llamada_participantes
     SET estado = 'salio',
         salio_at = NOW()
   WHERE llamada_id IN (SELECT id FROM zombis)
     AND estado = 'en_llamada';

  -- Mismo patron que la version por conversacion (085): ROW_COUNT despues de
  -- un CTE encadenado reflejaria el segundo UPDATE (participantes), no el de
  -- llamadas, asi que se recuenta por ventana de tiempo en vez de confiar en eso.
  SELECT COUNT(*) INTO cerradas
    FROM llamadas
   WHERE estado = 'terminada'
     AND terminada_at >= NOW() - INTERVAL '1 second';

  RETURN cerradas;
END $fn$;

REVOKE ALL ON FUNCTION cerrar_llamadas_zombis_global() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cerrar_llamadas_zombis_global() TO service_role;
