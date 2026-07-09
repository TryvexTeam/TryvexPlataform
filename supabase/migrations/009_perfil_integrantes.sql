-- Fase 2: Configuración de perfil
-- color: color personal del calendario, único por integrante (paleta predefinida)
-- horario: tiempo operativo para notificaciones [{dia, bloques:[{inicio,fin}]}]
-- notificaciones: toggles por tipo de aviso
ALTER TABLE dim_integrantes ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE dim_integrantes ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE dim_integrantes ADD COLUMN IF NOT EXISTS horario JSONB;
ALTER TABLE dim_integrantes ADD COLUMN IF NOT EXISTS notificaciones JSONB;

-- Color único: dos integrantes no pueden compartir color
CREATE UNIQUE INDEX IF NOT EXISTS idx_dim_integrantes_color
  ON dim_integrantes (color) WHERE color IS NOT NULL;

-- Cada integrante puede editar su propio registro (perfil)
DROP POLICY IF EXISTS "editar propio registro" ON dim_integrantes;
CREATE POLICY "editar propio registro"
  ON dim_integrantes FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
