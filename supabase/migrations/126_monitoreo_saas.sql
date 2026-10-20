-- Monitoreo de los SaaS que construyó Tryvex (el primero: Bitácora Coach).
--
-- Para qué: Tryvex cobra un porcentaje de lo que factura cada SaaS. Sin una
-- fuente propia, la cifra la dice el coach o el revendedor, y nada impide que
-- anule un cobro después de cerrado el mes o reporte de menos. El CRM tira
-- (pull) de `GET {MONITOREO_URL_<clave>}/api/ops/metrics` (contrato `tryvex.metrics/v1`),
-- guarda cada respuesta tal cual llegó y compara contra la anterior: si un mes
-- cerrado cambia de sello o baja su total, queda una alerta.
--
-- Tres decisiones que no se ven en el esquema:
--   · Ni la URL ni el token viven en la base. La fila solo trae una `clave`
--     (p. ej. BITACORA) y el servidor lee el par MONITOREO_URL_<CLAVE> y
--     MONITOREO_TOKEN_<CLAVE> de sus variables de entorno, siempre juntos. Así
--     editar esta tabla no puede mandar un token a otro servidor (SSRF /
--     exfiltración) ni combinar la URL de un SaaS con el token de otro: quien
--     controla adónde va cada token es quien controla el deploy, no la base.
--   · `saas_snapshots` es solo-agregar: es la evidencia. Si se pudiera editar,
--     el historial que prueba un mes alterado se podría alterar también.
--   · Escribe solo el servidor (service role, desde el cron o la acción de
--     "Actualizar ahora", que valida permisos en el servidor). Para el equipo,
--     solo lectura y solo con permiso de finanzas: son ingresos de un cliente.

-- ── Qué se monitorea ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_monitoreados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id       UUID NOT NULL REFERENCES dim_proyectos(id) ON DELETE CASCADE,
  -- Sufijo de las variables MONITOREO_URL_<clave> y MONITOREO_TOKEN_<clave>.
  clave             TEXT NOT NULL UNIQUE CHECK (clave ~ '^[A-Z0-9_]{2,40}$'),
  porcentaje_tryvex NUMERIC(5,2) NOT NULL
    CHECK (porcentaje_tryvex >= 0 AND porcentaje_tryvex <= 100),
  -- Última migración que `main` del SaaS ya tiene. Si la base reporta una
  -- anterior, alerta SCHEMA_BEHIND. Nulo = no se compara.
  schema_esperado   TEXT NULL CHECK (schema_esperado IS NULL OR char_length(schema_esperado) <= 200),
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saas_monitoreados_proyecto_unico UNIQUE (proyecto_id)
);

COMMENT ON TABLE saas_monitoreados IS
  'SaaS construidos por Tryvex que el CRM monitorea (tryvex.metrics/v1). URL y token salen de las variables MONITOREO_URL_<clave> y MONITOREO_TOKEN_<clave>, nunca de la base.';

-- ── Cada pull, tal cual llegó (solo-agregar) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saas_id     UUID NOT NULL REFERENCES saas_monitoreados(id) ON DELETE RESTRICT,
  tomado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 0 = no hubo respuesta HTTP (timeout, DNS, TLS, variables sin configurar, URL rechazada).
  http_status INTEGER NOT NULL CHECK (http_status BETWEEN 0 AND 599),
  payload     JSONB NULL,
  error       TEXT NULL CHECK (error IS NULL OR char_length(error) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_saas_snapshots_saas_tomado
  ON saas_snapshots (saas_id, tomado_en DESC);

CREATE OR REPLACE FUNCTION saas_snapshots_solo_agregar()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'saas_snapshots es solo-agregar: % no permitido', TG_OP
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_saas_snapshots_solo_agregar ON saas_snapshots;
CREATE TRIGGER trg_saas_snapshots_solo_agregar
  BEFORE UPDATE OR DELETE ON saas_snapshots
  FOR EACH ROW EXECUTE FUNCTION saas_snapshots_solo_agregar();

-- TRUNCATE no dispara triggers de fila: se cierra aparte.
DROP TRIGGER IF EXISTS trg_saas_snapshots_sin_truncate ON saas_snapshots;
CREATE TRIGGER trg_saas_snapshots_sin_truncate
  BEFORE TRUNCATE ON saas_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION saas_snapshots_solo_agregar();

REVOKE ALL ON FUNCTION saas_snapshots_solo_agregar() FROM PUBLIC, anon, authenticated;

-- ── Alertas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_alertas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saas_id     UUID NOT NULL REFERENCES saas_monitoreados(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN (
                'SEAL_CHANGED', 'REVENUE_DECREASED', 'ANNULMENTS_SPIKE',
                'SAAS_DOWN', 'SCHEMA_BEHIND')),
  -- Qué se alerta (p. ej. 'org-x|2026-09|CLP'). Junto al tipo, evita repetir
  -- la misma alerta abierta en cada pull.
  clave       TEXT NOT NULL CHECK (char_length(clave) <= 300),
  detalle     JSONB NOT NULL DEFAULT '{}'::jsonb,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_en TIMESTAMPTZ NULL CHECK (resuelta_en IS NULL OR resuelta_en >= creada_en)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_alertas_abierta
  ON saas_alertas (saas_id, tipo, clave) WHERE resuelta_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_saas_alertas_saas_creada
  ON saas_alertas (saas_id, creada_en DESC);

-- ── Permisos ─────────────────────────────────────────────────────────────────
ALTER TABLE saas_monitoreados ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_alertas      ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el equipo con permiso de finanzas (mismo criterio que
-- movimientos_financieros): son montos cobrados por un cliente. Sin policies
-- de escritura: escribe únicamente service role, que no pasa por RLS.
REVOKE ALL ON saas_monitoreados, saas_snapshots, saas_alertas FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON saas_monitoreados, saas_snapshots, saas_alertas FROM authenticated;
GRANT SELECT ON saas_monitoreados, saas_snapshots, saas_alertas TO authenticated;

DROP POLICY IF EXISTS "leer saas monitoreados con permiso" ON saas_monitoreados;
CREATE POLICY "leer saas monitoreados con permiso"
  ON saas_monitoreados FOR SELECT TO authenticated
  USING (tengo_permiso('ver_finanzas'));

DROP POLICY IF EXISTS "leer snapshots con permiso" ON saas_snapshots;
CREATE POLICY "leer snapshots con permiso"
  ON saas_snapshots FOR SELECT TO authenticated
  USING (tengo_permiso('ver_finanzas'));

DROP POLICY IF EXISTS "leer alertas saas con permiso" ON saas_alertas;
CREATE POLICY "leer alertas saas con permiso"
  ON saas_alertas FOR SELECT TO authenticated
  USING (tengo_permiso('ver_finanzas'));
