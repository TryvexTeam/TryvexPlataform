-- Fase 1: Cliente = persona, negocio pasa a ser secundario + pagos operativos
-- El cliente principal es la persona (nombre_contacto); el negocio deja de ser
-- obligatorio porque conceptualmente pertenece al proyecto asociado.
ALTER TABLE dim_clientes ALTER COLUMN nombre_negocio DROP NOT NULL;

-- fact_ventas: fecha de vencimiento para saber cuándo corresponde cobrar
ALTER TABLE fact_ventas ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
ALTER TABLE fact_ventas ADD COLUMN IF NOT EXISTS descripcion TEXT;

CREATE INDEX IF NOT EXISTS idx_fact_ventas_cliente ON fact_ventas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_fact_ventas_estado ON fact_ventas (estado_pago);
