-- Indices faltantes sobre columnas usadas en filtros reales (lib/repos/*.ts)
-- y un CHECK constraint que garantiza que un lead "perdido" siempre tenga razon.
--
-- Aditivo y seguro: solo CREATE INDEX IF NOT EXISTS y un CHECK NOT VALID.
-- No incluye (pendientes de decision aparte, requieren limpiar duplicados antes):
--   - trigger "lead ganado exige cliente"
--   - UNIQUE de email/telefono en dim_clientes

CREATE INDEX IF NOT EXISTS idx_dim_proyectos_cliente ON dim_proyectos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_dim_proyectos_responsable ON dim_proyectos (responsable_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_proyecto ON movimientos_financieros (proyecto_id) WHERE proyecto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fact_leads_nicho ON fact_leads (nicho) WHERE nicho IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fact_leads_localidad ON fact_leads (localidad) WHERE localidad IS NOT NULL;

-- Un lead "perdido" siempre debe tener razon_perdida.
-- NOT VALID a proposito: no valida filas existentes (podria haber leads
-- "perdido" sin razon ya en produccion). El check se aplica a partir de
-- ahora para filas nuevas/modificadas; validar el historico es una
-- decision aparte (requiere limpiar datos existentes primero).
ALTER TABLE fact_leads
  ADD CONSTRAINT fact_leads_perdido_exige_razon
  CHECK (estado <> 'perdido' OR razon_perdida IS NOT NULL) NOT VALID;
