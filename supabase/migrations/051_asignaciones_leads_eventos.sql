-- ============================================================
-- 051 — Multi-asignación de leads y citas a integrantes, con rol
--
-- Contexto (PRP-008, fase 1):
--   La asignación de leads existía como columna única `fact_leads.responsable_id`.
--   Las citas ya soportaban varios integrantes vía `eventos_asistentes` (005),
--   pero sin rol, sin saber quién asignó ni cuándo.
--
--   Se replica el patrón puente ya validado en `tarea_responsables` (000/023),
--   agregando lo que a ese le falta: rol, autoría y timestamp.
--
--   `eventos_asistentes` se EXTIENDE en vez de crear una tabla paralela: ya
--   existe y tiene datos.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- (A) Leads: tabla puente nueva
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_asignaciones (
  lead_id        UUID NOT NULL REFERENCES fact_leads(id)      ON DELETE CASCADE,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  rol            TEXT NOT NULL DEFAULT 'colaborador'
                 CHECK (rol IN ('owner', 'colaborador')),
  asignado_por   UUID          REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- La PK compuesta es el anti-duplicado: un integrante no puede estar dos
  -- veces en el mismo lead. Mismo criterio que `tarea_responsables`.
  PRIMARY KEY (lead_id, integrante_id)
);

-- El lookup por lead lo cubre la PK; falta el sentido inverso
-- ("qué leads tiene esta persona"), que es el que usa el dashboard.
CREATE INDEX IF NOT EXISTS lead_asignaciones_integrante_idx
  ON lead_asignaciones(integrante_id);

-- ─────────────────────────────────────────────────────────────
-- (B) Citas: extender `eventos_asistentes` (005_eventos.sql:18)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE eventos_asistentes
  ADD COLUMN IF NOT EXISTS rol          TEXT NOT NULL DEFAULT 'colaborador',
  ADD COLUMN IF NOT EXISTS asignado_por UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- El CHECK va aparte: ADD COLUMN IF NOT EXISTS no admite CHECK inline
-- de forma idempotente si la columna ya existía.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eventos_asistentes_rol_check'
  ) THEN
    ALTER TABLE eventos_asistentes
      ADD CONSTRAINT eventos_asistentes_rol_check
      CHECK (rol IN ('owner', 'colaborador'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS eventos_asistentes_integrante_idx
  ON eventos_asistentes(integrante_id);

-- ─────────────────────────────────────────────────────────────
-- (C) Backfill: la asignación single que ya existe pasa a ser `owner`
-- ─────────────────────────────────────────────────────────────
-- `fact_leads.responsable_id` (000_schema_inicial.sql:52) NO se elimina aquí.
-- Convive con la tabla puente hasta que la fase 6 lo retire con aprobación
-- explícita. Así esta migración es reversible sin pérdida de datos.
INSERT INTO lead_asignaciones (lead_id, integrante_id, rol, asignado_por)
SELECT l.id, l.responsable_id, 'owner', NULL
  FROM fact_leads l
 WHERE l.responsable_id IS NOT NULL
ON CONFLICT (lead_id, integrante_id) DO NOTHING;

-- Los asistentes de citas que ya existían quedan como 'colaborador' por el
-- DEFAULT. El creador de cada evento pasa a 'owner' si figura como asistente.
UPDATE eventos_asistentes ea
   SET rol = 'owner'
  FROM eventos e
 WHERE e.id = ea.evento_id
   AND e.creado_por = ea.integrante_id
   AND ea.rol <> 'owner';

-- ─────────────────────────────────────────────────────────────
-- (D) RLS — lead_asignaciones
-- ─────────────────────────────────────────────────────────────
-- Mismo nivel de acceso que las tareas: cualquier integrante activo del equipo
-- gestiona asignaciones de leads. El CRM es de equipo chico y los leads son
-- del negocio, no privados de cada persona.
ALTER TABLE lead_asignaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrantes acceso total" ON lead_asignaciones;
CREATE POLICY "integrantes acceso total"
  ON lead_asignaciones FOR ALL TO authenticated
  USING (is_integrante()) WITH CHECK (is_integrante());

-- ─────────────────────────────────────────────────────────────
-- (E) RLS — eventos_asistentes: de una policy gruesa a cuatro finas
-- ─────────────────────────────────────────────────────────────
-- La 005 tenía "creador gestiona asistentes" (FOR ALL): solo el creador del
-- evento podía tocar la lista. Eso impide la auto-asignación que pide el
-- producto. Se reemplaza por policies por operación.
DROP POLICY IF EXISTS "creador gestiona asistentes" ON eventos_asistentes;

-- Leer: cualquier integrante (sin cambio respecto de la 005).
DROP POLICY IF EXISTS "integrantes leen asistentes" ON eventos_asistentes;
CREATE POLICY "integrantes leen asistentes"
  ON eventos_asistentes FOR SELECT TO authenticated
  USING (is_integrante());

-- Insertar: (a) un integrante se agrega A SÍ MISMO — auto-asignación;
--           (b) el creador del evento agrega a quien sea — asignar al crear.
-- Lo que NO permite: que alguien agregue a un tercero a la cita de otro.
DROP POLICY IF EXISTS "autoasignacion o creador inserta" ON eventos_asistentes;
CREATE POLICY "autoasignacion o creador inserta"
  ON eventos_asistentes FOR INSERT TO authenticated
  WITH CHECK (
    integrante_id = (
      SELECT id FROM dim_integrantes
       WHERE auth_user_id = auth.uid() AND activo
    )
    OR EXISTS (
      SELECT 1 FROM eventos e
       WHERE e.id = evento_id
         AND e.creado_por = (
           SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()
         )
    )
  );

-- Actualizar el rol: solo el creador del evento.
-- Impide que alguien se autoproclame `owner` de la cita de otro.
DROP POLICY IF EXISTS "creador actualiza asistentes" ON eventos_asistentes;
CREATE POLICY "creador actualiza asistentes"
  ON eventos_asistentes FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM eventos e WHERE e.id = evento_id
     AND e.creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM eventos e WHERE e.id = evento_id
     AND e.creado_por = (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid())
  ));

-- Borrar: el creador quita a cualquiera; cada quien puede QUITARSE a sí mismo.
DROP POLICY IF EXISTS "creador o propio borra asistente" ON eventos_asistentes;
CREATE POLICY "creador o propio borra asistente"
  ON eventos_asistentes FOR DELETE TO authenticated
  USING (
    integrante_id = (
      SELECT id FROM dim_integrantes
       WHERE auth_user_id = auth.uid() AND activo
    )
    OR EXISTS (
      SELECT 1 FROM eventos e
       WHERE e.id = evento_id
         AND e.creado_por = (
           SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()
         )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- (F) Realtime — mismo mecanismo que la 023
-- ─────────────────────────────────────────────────────────────
-- `eventos_asistentes` puede ya estar en la publicación; ADD TABLE falla si lo
-- está, así que se agrega solo lo que falte.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'lead_asignaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lead_asignaciones;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'eventos_asistentes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE eventos_asistentes;
  END IF;
END $$;

ALTER TABLE lead_asignaciones  REPLICA IDENTITY FULL;
ALTER TABLE eventos_asistentes REPLICA IDENTITY FULL;
