-- Equipo de un proyecto.
--
-- Hasta ahora un proyecto solo tenía `responsable_id`: una persona. Pero un
-- proyecto lo trabaja un equipo, y sin saber quiénes son no se puede responder
-- "en cuántos proyectos está metido cada uno", que es lo que pide el marcador.
--
-- `responsable_id` se conserva y pasa a significar QUIÉN LIDERA. Retirarlo
-- habría obligado a tocar todo lo que hoy lo lee, sin ganar nada: un equipo y
-- un líder son dos datos distintos.

CREATE TABLE IF NOT EXISTS proyecto_integrantes (
  proyecto_id    UUID NOT NULL REFERENCES dim_proyectos(id)   ON DELETE CASCADE,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proyecto_id, integrante_id)
);

-- Por integrante: "sus proyectos" es la consulta del marcador y se hace en cada
-- carga del panel. La clave primaria ya cubre el sentido contrario.
CREATE INDEX IF NOT EXISTS idx_proyecto_integrantes_integrante
  ON proyecto_integrantes (integrante_id);

-- El responsable actual de cada proyecto entra como miembro de su propio
-- equipo. Sin esto, los proyectos que ya existen aparecerían sin nadie, y el
-- marcador diría que nadie trabaja en nada.
INSERT INTO proyecto_integrantes (proyecto_id, integrante_id)
SELECT id, responsable_id
FROM dim_proyectos
WHERE responsable_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE proyecto_integrantes ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que el resto del esquema: cualquier integrante de la casa ve
-- y edita. La tabla no guarda nada más sensible que quién trabaja en qué.
DROP POLICY IF EXISTS "integrantes acceso total" ON proyecto_integrantes;
CREATE POLICY "integrantes acceso total" ON proyecto_integrantes
  FOR ALL TO authenticated
  USING (is_integrante())
  WITH CHECK (is_integrante());

ALTER PUBLICATION supabase_realtime ADD TABLE proyecto_integrantes;
