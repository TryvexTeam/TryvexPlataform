-- Dos cosas que no comparten tema pero sí despliegue: el freno del "olvidé mi
-- contraseña" y el saldo inicial que no se podía dar por cerrado.

-- ── 1. Rate limit del reseteo de contraseña ──────────────────────────────────
-- Un contador en memoria no sirve: cada invocación serverless arranca con la suya,
-- así que el límite se evapora. La cuenta vive en la base.
--
-- Solo el servidor (service_role) escribe aquí. La tabla no se expone a
-- 'authenticated' porque el endpoint que la usa es público y anónimo por diseño.
CREATE TABLE IF NOT EXISTS password_reset_intentos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_email_fecha ON password_reset_intentos (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_ip_fecha    ON password_reset_intentos (ip, created_at DESC);

ALTER TABLE password_reset_intentos ENABLE ROW LEVEL SECURITY;
-- Sin policies para 'authenticated': nadie logueado tiene por qué leer esto.
REVOKE ALL ON password_reset_intentos FROM authenticated, anon;
GRANT ALL ON password_reset_intentos TO service_role;

-- Higiene: los intentos viejos no sirven ni para el límite ni para auditar.
CREATE OR REPLACE FUNCTION limpiar_reset_intentos()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM password_reset_intentos WHERE created_at < NOW() - INTERVAL '7 days';
$$;

-- ── 2. Saldo inicial que se puede dar por cerrado ────────────────────────────
-- El "monto pendiente" de un cliente no salía nunca de la vista aunque se anularan
-- todos sus pagos: el cálculo tomaba el máximo entre los pendientes registrados y el
-- saldo derivado de dim_clientes.valor_inicial_usd, y ese saldo no tenía forma de
-- llegar a cero salvo registrando cobros por el total. Este flag es esa forma:
-- marca "lo inicial quedó saldado o se descartó" sin tocar el valor histórico
-- acordado, que sigue sirviendo para reportes.
ALTER TABLE dim_clientes
  ADD COLUMN IF NOT EXISTS saldo_inicial_saldado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN dim_clientes.saldo_inicial_saldado IS
  'true = no arrastrar el saldo de valor_inicial_usd como monto por cobrar. No borra el valor acordado.';
