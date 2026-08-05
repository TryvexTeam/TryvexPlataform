-- Cuanto duro cada participacion en una llamada, y si paso por relay.
--
-- El porque: el audio y el video van navegador a navegador y no cuestan nada.
-- La UNICA parte que consume es el relay TURN, que entra en juego cuando los dos
-- extremos no logran conectarse directo (NAT estricto, wifi corporativo). Ese
-- consumo sale de los 1.000 GB/mes gratis de Cloudflare.
--
-- Sin estas dos columnas la pregunta "esto nos esta costando algo?" solo se puede
-- responder entrando al panel de Cloudflare, que nadie va a mirar. Con ellas, la
-- seccion de Finanzas lo dice sola.
--
-- El dato lo mide el navegador con getStats() al colgar: mira el par de
-- candidatos que quedo activo y pregunta si alguno es de tipo 'relay'. Es la
-- misma fuente que usa el indicador en vivo de la llamada, asi que lo que se
-- guarda es lo que se vio en pantalla.

ALTER TABLE llamada_participantes
  ADD COLUMN IF NOT EXISTS via_relay BOOLEAN,
  ADD COLUMN IF NOT EXISTS segundos  INTEGER;

COMMENT ON COLUMN llamada_participantes.via_relay IS
  'true = la conexion paso por TURN y consumio de la cuota. false = directa, costo cero. NULL = no se pudo medir (el navegador se cerro de golpe).';

COMMENT ON COLUMN llamada_participantes.segundos IS
  'Duracion real de la participacion, medida en el cliente. NULL si no llego a reportarse.';

-- NULL es un estado legitimo y hay que poder distinguirlo: si alguien cierra el
-- notebook de un golpe, nunca reporta. Contarlo como "directa" haria parecer el
-- consumo menor de lo que es; contarlo como "relay", mayor. Se cuenta aparte y
-- la pantalla dice cuantos quedaron sin medir, en vez de inventar un numero.

-- Indice para el resumen mensual de Finanzas: filtra por rango de fecha sobre la
-- llamada y suma los segundos de los participantes.
CREATE INDEX IF NOT EXISTS idx_llamadas_created
  ON llamadas (created_at DESC);

-- ── Resumen del mes ──────────────────────────────────────────────────────────
-- La estimacion de GB se hace aca y no en el cliente para que haya UN solo lugar
-- donde vive la formula.
--
-- 0,00009 GB por segundo sale de ~750 kbps de bajada por participante relayado
-- (video a la resolucion que usa la malla con 2-3 personas, mas audio). Es una
-- estimacion, no una factura: Cloudflare cobra por bytes reales que salen de su
-- borde, incluido el overhead de TURN. Sirve para saber si uno esta al 2% o al
-- 80% de la cuota, no para cuadrar centavos -- y la pantalla lo dice asi.
CREATE OR REPLACE VIEW llamadas_resumen_mes
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', (l.created_at AT TIME ZONE 'America/Santiago'))::date AS mes,
  count(DISTINCT l.id)                                                       AS llamadas,
  coalesce(sum(p.segundos), 0)                                               AS segundos_totales,
  coalesce(sum(p.segundos) FILTER (WHERE p.via_relay), 0)                    AS segundos_relay,
  count(*) FILTER (WHERE p.via_relay IS NULL AND p.estado = 'salio')         AS sin_medir,
  round(coalesce(sum(p.segundos) FILTER (WHERE p.via_relay), 0) * 0.00009, 2) AS gb_estimados
FROM llamadas l
JOIN llamada_participantes p ON p.llamada_id = l.id
GROUP BY 1;

GRANT SELECT ON llamadas_resumen_mes TO authenticated;

COMMENT ON VIEW llamadas_resumen_mes IS
  'Consumo de llamadas por mes. Solo los segundos por relay cuestan; los directos son gratis porque no tocan servidor. gb_estimados es una estimacion, no una factura.';
