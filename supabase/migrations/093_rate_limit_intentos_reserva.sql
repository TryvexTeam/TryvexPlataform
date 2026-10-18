-- Rate limit real para la reserva de cita publica.
--
-- == El problema ============================================================
--
-- `superaElLimite` (lib/repos/citas.ts) contaba filas de `reservas_landing`,
-- que solo tiene las reservas EXITOSAS. Quien probaba cien horas ocupadas y
-- fallaba cien veces no dejaba ni una fila ahi, asi que nunca tocaba el
-- limite: el freno solo frenaba a quien ya habia logrado reservar.
--
-- Lo que hay que contar son los INTENTOS. Esta tabla los junta; el endpoint
-- registra cada intento (POST validado, con IP determinada) ANTES de llamar
-- al RPC, y `superaElLimite` cuenta aca.
--
-- Mismo patron que `password_reset_intentos` (030): tabla aparte, solo la
-- escribe el servidor con service_role, sin exposicion a anon ni authenticated.

CREATE TABLE IF NOT EXISTS intentos_reserva_publica (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip        TEXT NOT NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intentos_reserva_ip_fecha
  ON intentos_reserva_publica (ip, creado_at DESC);

ALTER TABLE intentos_reserva_publica ENABLE ROW LEVEL SECURITY;

-- Sin policies: nadie logueado ni anonimo tiene por que leer ni escribir esto.
-- El RPC no la toca; la escribe el endpoint con service_role.
REVOKE ALL ON intentos_reserva_publica FROM PUBLIC, anon, authenticated;
GRANT  ALL ON intentos_reserva_publica TO service_role;

-- Higiene: los intentos viejos no sirven ni para el limite ni para auditar.
CREATE OR REPLACE FUNCTION limpiar_intentos_reserva_publica()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM intentos_reserva_publica WHERE creado_at < NOW() - INTERVAL '7 days';
$$;

-- == Comprobacion ==========================================================
--
-- (a) La tabla no es legible ni escribible sin ser el servidor:
--       SELECT has_table_privilege('anon',          'intentos_reserva_publica', 'SELECT'),
--              has_table_privilege('authenticated', 'intentos_reserva_publica', 'INSERT');
--       -- ambas false; service_role true
--
-- (b) El freno cuenta intentos y no reservas: registrar 3 intentos de una IP
--     sin reservar nada y verificar que la 4a solicitud de esa IP recibe 429.
