-- Cuándo se dio una tarea por terminada.
--
-- Hasta ahora solo existía `updated_at`, que sirve para otra cosa: cualquier
-- edición posterior lo mueve. Contar "tareas completadas esta semana" con él
-- haría que una tarea cerrada en junio y retocada hoy figure como trabajo de
-- esta semana, y que una cerrada el lunes desaparezca del recuento si nadie la
-- volvió a tocar.

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS completada_at TIMESTAMPTZ NULL;

-- Las que ya están listas heredan su `updated_at`. Es una aproximación —para
-- la mayoría, la última edición FUE darla por terminada— y es lo único que hay:
-- el dato exacto no se guardó nunca.
UPDATE tareas
SET completada_at = updated_at
WHERE estado = 'listo' AND completada_at IS NULL;

-- Lo mantiene el disparador y no el código de la aplicación: la tarea cambia de
-- estado desde varias rutas (el tablero, la ficha, el panel del lead) y a la
-- larga alguna se olvidaría de escribirlo.
CREATE OR REPLACE FUNCTION marcar_completada_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'listo' AND (OLD.estado IS DISTINCT FROM 'listo') THEN
    NEW.completada_at := now();
  -- Reabrir una tarea borra la marca: si no, seguiría contando como terminada
  -- una que volvió al tablero.
  ELSIF NEW.estado <> 'listo' AND OLD.estado = 'listo' THEN
    NEW.completada_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marcar_completada_at ON tareas;
CREATE TRIGGER trg_marcar_completada_at
  BEFORE UPDATE ON tareas
  FOR EACH ROW
  EXECUTE FUNCTION marcar_completada_at();

CREATE INDEX IF NOT EXISTS idx_tareas_completada_at
  ON tareas (completada_at)
  WHERE completada_at IS NOT NULL;
