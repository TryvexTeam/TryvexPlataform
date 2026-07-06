-- Tryvex CRM — Schema inicial
-- Idempotente: seguro re-ejecutar (IF NOT EXISTS en todo)

-- ══════════════ DIMENSIONES ══════════════

CREATE TABLE IF NOT EXISTS dim_integrantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  rol_principal  TEXT,
  especialidad   TEXT,
  avatar_url     TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_clientes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio          TEXT NOT NULL,
  nombre_contacto         TEXT,
  telefono                TEXT,
  email                   TEXT,
  nicho                   TEXT,
  localidad               TEXT,
  redes_sociales          JSONB,
  fecha_cierre            DATE,
  valor_inicial_usd       NUMERIC(12,2),
  mantencion_mensual_usd  NUMERIC(12,2),
  estado                  TEXT NOT NULL DEFAULT 'activo'
                          CHECK (estado IN ('activo','pausado','cancelado')),
  notas                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_proyectos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID REFERENCES dim_clientes(id) ON DELETE SET NULL,
  nombre           TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('landing','automatizacion','mantencion','otro')),
  estado           TEXT NOT NULL DEFAULT 'brief'
                   CHECK (estado IN ('brief','desarrollo','revision','entregado','mantencion','cerrado')),
  stack            TEXT[],
  horas_estimadas  NUMERIC(8,2),
  horas_reales     NUMERIC(8,2),
  costo_total_usd  NUMERIC(12,2),
  url_deploy       TEXT,
  repo_url         TEXT,
  fecha_inicio     DATE,
  fecha_entrega    DATE,
  responsable_id   UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════ HECHOS ══════════════

CREATE TABLE IF NOT EXISTS fact_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio   TEXT NOT NULL,
  telefono         TEXT,
  info_texto       TEXT,
  redes_sociales   JSONB,
  tiene_web        BOOLEAN,
  url_web          TEXT,
  nicho            TEXT,
  localidad        TEXT,
  score            INTEGER CHECK (score BETWEEN 0 AND 100),
  estado           TEXT NOT NULL DEFAULT 'sin_contactar'
                   CHECK (estado IN ('sin_contactar','contactado','interesado','reunion_agendada','cerrado','descartado')),
  responsable_id   UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  origen           TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('scraper','manual','referido')),
  ultimo_contacto  TIMESTAMPTZ,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_ventas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID REFERENCES dim_clientes(id) ON DELETE SET NULL,
  proyecto_id   UUID REFERENCES dim_proyectos(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('inicial','mantencion','extra')),
  monto_usd     NUMERIC(12,2),
  monto_clp     NUMERIC(14,0),
  estado_pago   TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado_pago IN ('pendiente','pagado','atrasado','cancelado')),
  fecha_emision DATE,
  fecha_pago    DATE,
  metodo_pago   TEXT CHECK (metodo_pago IN ('mercadopago','transferencia','otro')),
  referencia    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════ TAREAS ══════════════

CREATE TABLE IF NOT EXISTS tareas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  tipo          TEXT NOT NULL DEFAULT 'general' CHECK (tipo IN ('error','feature','pulir','general')),
  estado        TEXT NOT NULL DEFAULT 'sin_empezar' CHECK (estado IN ('sin_empezar','en_curso','listo')),
  prioridad     TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  esfuerzo      TEXT NOT NULL DEFAULT 'medio' CHECK (esfuerzo IN ('pequeno','medio','grande')),
  fecha_limite  DATE,
  proyecto_id   UUID REFERENCES dim_proyectos(id) ON DELETE SET NULL,
  cliente_id    UUID REFERENCES dim_clientes(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tarea_responsables (
  tarea_id       UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, integrante_id)
);

CREATE TABLE IF NOT EXISTS subtareas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id      UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  descripcion   TEXT NOT NULL,
  completada    BOOLEAN NOT NULL DEFAULT false,
  orden         INTEGER,
  completed_at  TIMESTAMPTZ
);

-- ══════════════ INTERACCIONES / REUNIONES ══════════════

CREATE TABLE IF NOT EXISTS interacciones_lead (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES fact_leads(id) ON DELETE CASCADE,
  integrante_id  UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('whatsapp','llamada','instagram','meet','email','nota')),
  contenido      TEXT,
  respondio      BOOLEAN,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reuniones (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                UUID REFERENCES fact_leads(id) ON DELETE SET NULL,
  cliente_id             UUID REFERENCES dim_clientes(id) ON DELETE SET NULL,
  fecha                  TIMESTAMPTZ NOT NULL,
  duracion_min           INTEGER,
  asistentes_ids         UUID[],
  url_fathom             TEXT,
  transcripcion          TEXT,
  resumen                TEXT,
  necesidades_extraidas  JSONB,
  proximos_pasos         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════ CEREBRO / ACTIVIDAD ══════════════

CREATE TABLE IF NOT EXISTS cerebro_docs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  titulo        TEXT NOT NULL,
  categoria     TEXT NOT NULL DEFAULT 'general' CHECK (categoria IN ('procesos','playbook','tecnico','general')),
  contenido_md  TEXT,
  icono         TEXT,
  orden         INTEGER,
  created_by    UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actividad (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id    UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  tipo_evento      TEXT NOT NULL,
  referencia_id    UUID,
  referencia_tipo  TEXT CHECK (referencia_tipo IN ('lead','tarea','proyecto','cliente','reunion','venta')),
  descripcion      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════ ÍNDICES ══════════════

CREATE INDEX IF NOT EXISTS fact_leads_estado_idx ON fact_leads(estado);
CREATE INDEX IF NOT EXISTS fact_leads_responsable_idx ON fact_leads(responsable_id);
CREATE INDEX IF NOT EXISTS fact_ventas_cliente_idx ON fact_ventas(cliente_id);
CREATE INDEX IF NOT EXISTS tareas_estado_idx ON tareas(estado);
CREATE INDEX IF NOT EXISTS tareas_proyecto_idx ON tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS subtareas_tarea_idx ON subtareas(tarea_id);
CREATE INDEX IF NOT EXISTS interacciones_lead_lead_idx ON interacciones_lead(lead_id);
CREATE INDEX IF NOT EXISTS actividad_created_idx ON actividad(created_at DESC);

-- ══════════════ FUNCIÓN is_integrante + RLS ══════════════

CREATE OR REPLACE FUNCTION is_integrante()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dim_integrantes
    WHERE auth_user_id = auth.uid() AND activo = true
  );
$$;

-- updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dim_clientes','dim_proyectos','fact_leads','tareas','cerebro_docs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END;
$$;

-- RLS: solo integrantes activos acceden (service role hace bypass automático)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dim_integrantes','dim_clientes','dim_proyectos','fact_leads','fact_ventas',
    'tareas','tarea_responsables','subtareas','interacciones_lead','reuniones',
    'cerebro_docs','actividad'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "integrantes acceso total" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "integrantes acceso total" ON %I FOR ALL TO authenticated USING (is_integrante()) WITH CHECK (is_integrante())',
      t
    );
  END LOOP;
END;
$$;

-- dim_integrantes: el propio usuario puede leerse aunque aún no esté activo
DROP POLICY IF EXISTS "leer propio registro" ON dim_integrantes;
CREATE POLICY "leer propio registro"
  ON dim_integrantes FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
