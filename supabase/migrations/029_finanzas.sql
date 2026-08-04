-- Ingresos y egresos de la empresa (fondos), con voucher adjunto.
--
-- Por qué separado de fact_ventas: fact_ventas es lo que se le cobra a un cliente
-- (facturación). Esto es la caja de la empresa: entra plata (cobros, aportes,
-- devoluciones) y sale plata (sueldos, herramientas, servicios, impuestos). Un cobro
-- puede existir en fact_ventas y no haber entrado a caja todavía; y hay egresos que
-- no tienen cliente alguno. Mezclarlos daría un saldo falso.
--
-- Moneda: el valor canónico es CLP (la empresa opera en Chile). monto_usd queda como
-- referencia opcional, igual que en fact_ventas. Los totales se suman en CLP.

CREATE TABLE IF NOT EXISTS movimientos_financieros (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  categoria      TEXT NOT NULL,
  descripcion    TEXT NOT NULL,
  monto_clp      NUMERIC(14,2) NOT NULL CHECK (monto_clp > 0),
  monto_usd      NUMERIC(12,2) CHECK (monto_usd IS NULL OR monto_usd > 0),
  fecha          DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Santiago')::date,
  metodo_pago    TEXT CHECK (metodo_pago IS NULL OR metodo_pago IN ('transferencia','efectivo','tarjeta','mercadopago','otro')),
  contraparte    TEXT,
  cliente_id     UUID REFERENCES dim_clientes(id) ON DELETE SET NULL,
  proyecto_id    UUID REFERENCES dim_proyectos(id) ON DELETE SET NULL,
  venta_id       UUID REFERENCES fact_ventas(id) ON DELETE SET NULL,
  -- Ruta dentro del bucket privado 'vouchers'. NULL = movimiento sin respaldo.
  voucher_path   TEXT,
  voucher_nombre TEXT,
  notas          TEXT,
  creado_por     UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_fecha    ON movimientos_financieros (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo     ON movimientos_financieros (tipo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_cliente  ON movimientos_financieros (cliente_id) WHERE cliente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION touch_movimiento_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_movimientos_updated_at ON movimientos_financieros;
CREATE TRIGGER trg_movimientos_updated_at
  BEFORE UPDATE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION touch_movimiento_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Ver requiere permiso de lectura; escribir requiere el de gestión. Sin GRANT esto
-- devolvería 42501 aunque la policy pase: Postgres evalúa privilegios ANTES que RLS.
ALTER TABLE movimientos_financieros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leer finanzas con permiso" ON movimientos_financieros;
CREATE POLICY "leer finanzas con permiso"
  ON movimientos_financieros FOR SELECT TO authenticated
  USING (tengo_permiso('ver_finanzas'));

DROP POLICY IF EXISTS "crear movimiento con permiso" ON movimientos_financieros;
CREATE POLICY "crear movimiento con permiso"
  ON movimientos_financieros FOR INSERT TO authenticated
  WITH CHECK (tengo_permiso('gestionar_finanzas'));

DROP POLICY IF EXISTS "editar movimiento con permiso" ON movimientos_financieros;
CREATE POLICY "editar movimiento con permiso"
  ON movimientos_financieros FOR UPDATE TO authenticated
  USING (tengo_permiso('gestionar_finanzas'))
  WITH CHECK (tengo_permiso('gestionar_finanzas'));

DROP POLICY IF EXISTS "borrar movimiento con permiso" ON movimientos_financieros;
CREATE POLICY "borrar movimiento con permiso"
  ON movimientos_financieros FOR DELETE TO authenticated
  USING (tengo_permiso('gestionar_finanzas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON movimientos_financieros TO authenticated;
GRANT ALL ON movimientos_financieros TO service_role;

-- ── Vouchers: bucket privado ─────────────────────────────────────────────────
-- Privado a propósito: un comprobante lleva montos, nombres y a veces números de
-- cuenta. Se sirve con URL firmada de corta duración desde el servidor.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vouchers', 'vouchers', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ver vouchers con permiso" ON storage.objects;
CREATE POLICY "ver vouchers con permiso"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vouchers' AND tengo_permiso('ver_finanzas'));

DROP POLICY IF EXISTS "subir vouchers con permiso" ON storage.objects;
CREATE POLICY "subir vouchers con permiso"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vouchers' AND tengo_permiso('gestionar_finanzas'));

DROP POLICY IF EXISTS "borrar vouchers con permiso" ON storage.objects;
CREATE POLICY "borrar vouchers con permiso"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vouchers' AND tengo_permiso('gestionar_finanzas'));

-- ── Saldo mensual ────────────────────────────────────────────────────────────
-- security_invoker: la vista respeta las policies de quien consulta, no las del dueño.
-- Sin esto, cualquiera con acceso a la vista vería el saldo aunque no vea las filas.
DROP VIEW IF EXISTS finanzas_resumen_mensual;
CREATE VIEW finanzas_resumen_mensual WITH (security_invoker = true) AS
SELECT
  date_trunc('month', fecha)::date AS mes,
  SUM(monto_clp) FILTER (WHERE tipo = 'ingreso')::numeric AS ingresos_clp,
  SUM(monto_clp) FILTER (WHERE tipo = 'egreso')::numeric  AS egresos_clp,
  (COALESCE(SUM(monto_clp) FILTER (WHERE tipo = 'ingreso'), 0)
   - COALESCE(SUM(monto_clp) FILTER (WHERE tipo = 'egreso'), 0))::numeric AS saldo_clp,
  COUNT(*)::int AS movimientos
FROM movimientos_financieros
GROUP BY 1;

GRANT SELECT ON finanzas_resumen_mensual TO authenticated;
