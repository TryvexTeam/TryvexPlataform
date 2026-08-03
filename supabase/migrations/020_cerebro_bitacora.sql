-- Cerebro: bitácora del negocio. Una línea de tiempo por lead, cliente o proyecto,
-- alimentada por la propia base — nadie tiene que escribirla a mano.
--
-- Convive con cerebro_docs (wiki manual, 000_schema_inicial): eso son documentos,
-- esto son hechos con fecha.

CREATE TABLE IF NOT EXISTS cerebro_entradas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_tipo  TEXT NOT NULL CHECK (entidad_tipo IN ('lead','cliente','proyecto','reunion','venta','equipo')),
  entidad_id    UUID,
  fuente        TEXT NOT NULL CHECK (fuente IN ('whatsapp','interaccion','reunion','venta','estado','nota','scraper','sistema')),
  titulo        TEXT NOT NULL,
  contenido     TEXT,
  autor_id      UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  ocurrio_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- De dónde salió: hace idempotente el trigger y el backfill.
  origen_tabla  TEXT,
  origen_id     UUID,
  busqueda      TSVECTOR GENERATED ALWAYS AS (
                  to_tsvector('spanish', titulo || ' ' || COALESCE(contenido, ''))
                ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'equipo' es la bitácora general; el resto siempre cuelga de algo.
  CONSTRAINT entidad_con_id CHECK (entidad_tipo = 'equipo' OR entidad_id IS NOT NULL)
);

-- Índice total, no parcial: ON CONFLICT solo reconoce un índice parcial si la
-- cláusula repite su predicado, y omitirlo da 42P10. Las notas manuales llevan
-- origen_id NULL y no colisionan entre sí porque Postgres trata cada NULL como
-- distinto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cerebro_origen
  ON cerebro_entradas (origen_tabla, origen_id);

CREATE INDEX IF NOT EXISTS idx_cerebro_entidad
  ON cerebro_entradas (entidad_tipo, entidad_id, ocurrio_at DESC);

CREATE INDEX IF NOT EXISTS idx_cerebro_ocurrio ON cerebro_entradas (ocurrio_at DESC);
CREATE INDEX IF NOT EXISTS idx_cerebro_busqueda ON cerebro_entradas USING GIN (busqueda);

-- Definida también en 019. Se repite acá para que esta migración pueda correr
-- sola: las policies de más abajo la necesitan.
CREATE OR REPLACE FUNCTION mi_integrante_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION mi_integrante_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mi_integrante_id() TO authenticated;

ALTER TABLE cerebro_entradas ENABLE ROW LEVEL SECURITY;

-- La bitácora es del equipo: cualquier integrante activo la lee y puede anotar.
DROP POLICY IF EXISTS "leer bitacora" ON cerebro_entradas;
CREATE POLICY "leer bitacora"
  ON cerebro_entradas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true));

DROP POLICY IF EXISTS "anotar en bitacora" ON cerebro_entradas;
CREATE POLICY "anotar en bitacora"
  ON cerebro_entradas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true));

-- Solo se edita o borra la nota propia, y solo si es manual: los hechos
-- generados por la base no se reescriben.
DROP POLICY IF EXISTS "editar nota propia" ON cerebro_entradas;
CREATE POLICY "editar nota propia"
  ON cerebro_entradas FOR UPDATE TO authenticated
  USING (fuente = 'nota' AND autor_id = mi_integrante_id())
  WITH CHECK (fuente = 'nota' AND autor_id = mi_integrante_id());

DROP POLICY IF EXISTS "borrar nota propia" ON cerebro_entradas;
CREATE POLICY "borrar nota propia"
  ON cerebro_entradas FOR DELETE TO authenticated
  USING (fuente = 'nota' AND autor_id = mi_integrante_id());

-- RLS sin GRANT = 42501: Postgres evalúa privilegios ANTES que las policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON cerebro_entradas TO authenticated;

-- ── Alimentación automática ───────────────────────────────────────────────
-- SECURITY DEFINER: la entrada se escribe aunque quien dispare el hecho sea el
-- bot de WhatsApp o el scraper, que no actúan como un integrante autenticado.

CREATE OR REPLACE FUNCTION cerebro_desde_interaccion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO cerebro_entradas (
    entidad_tipo, entidad_id, fuente, titulo, contenido, autor_id, ocurrio_at,
    metadata, origen_tabla, origen_id
  )
  VALUES (
    'lead', NEW.lead_id, 'interaccion',
    'Contacto por ' || NEW.tipo,
    NEW.contenido, NEW.integrante_id, NEW.created_at,
    jsonb_build_object('tipo', NEW.tipo, 'respondio', NEW.respondio),
    'interacciones_lead', NEW.id
  )
  ON CONFLICT (origen_tabla, origen_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cerebro_desde_mensaje_wa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO cerebro_entradas (
    entidad_tipo, entidad_id, fuente, titulo, contenido, ocurrio_at,
    metadata, origen_tabla, origen_id
  )
  VALUES (
    CASE WHEN NEW.lead_id IS NOT NULL THEN 'lead' ELSE 'cliente' END,
    COALESCE(NEW.lead_id, NEW.cliente_id),
    'whatsapp',
    CASE WHEN NEW.direccion = 'in' THEN 'WhatsApp recibido' ELSE 'WhatsApp enviado' END,
    NEW.texto, NEW.created_at,
    jsonb_build_object('direccion', NEW.direccion, 'es_bot', NEW.es_bot),
    'mensajes_wa', NEW.id
  )
  ON CONFLICT (origen_tabla, origen_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cerebro_desde_reunion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO cerebro_entradas (
    entidad_tipo, entidad_id, fuente, titulo, contenido, ocurrio_at,
    metadata, origen_tabla, origen_id
  )
  VALUES (
    CASE WHEN NEW.lead_id IS NOT NULL THEN 'lead' ELSE 'cliente' END,
    COALESCE(NEW.lead_id, NEW.cliente_id),
    'reunion',
    'Reunión',
    COALESCE(NEW.resumen, NEW.proximos_pasos), NEW.fecha,
    jsonb_build_object('duracion_min', NEW.duracion_min, 'proximos_pasos', NEW.proximos_pasos),
    'reuniones', NEW.id
  )
  ON CONFLICT (origen_tabla, origen_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cerebro_desde_estado_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO cerebro_entradas (
      entidad_tipo, entidad_id, fuente, titulo, contenido, ocurrio_at, metadata
    )
    VALUES (
      'lead', NEW.id, 'estado',
      'Pasó de ' || OLD.estado || ' a ' || NEW.estado,
      NEW.notas, NOW(),
      jsonb_build_object('anterior', OLD.estado, 'nuevo', NEW.estado)
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cerebro_desde_venta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO cerebro_entradas (
    entidad_tipo, entidad_id, fuente, titulo, ocurrio_at, metadata, origen_tabla, origen_id
  )
  VALUES (
    'cliente', NEW.cliente_id, 'venta',
    'Venta registrada',
    NEW.created_at,
    to_jsonb(NEW) - 'id',
    'fact_ventas', NEW.id
  )
  ON CONFLICT (origen_tabla, origen_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cerebro_interaccion ON interacciones_lead;
CREATE TRIGGER trg_cerebro_interaccion
  AFTER INSERT ON interacciones_lead
  FOR EACH ROW EXECUTE FUNCTION cerebro_desde_interaccion();

DROP TRIGGER IF EXISTS trg_cerebro_wa ON mensajes_wa;
CREATE TRIGGER trg_cerebro_wa
  AFTER INSERT ON mensajes_wa
  FOR EACH ROW EXECUTE FUNCTION cerebro_desde_mensaje_wa();

DROP TRIGGER IF EXISTS trg_cerebro_reunion ON reuniones;
CREATE TRIGGER trg_cerebro_reunion
  AFTER INSERT ON reuniones
  FOR EACH ROW EXECUTE FUNCTION cerebro_desde_reunion();

DROP TRIGGER IF EXISTS trg_cerebro_estado_lead ON fact_leads;
CREATE TRIGGER trg_cerebro_estado_lead
  AFTER UPDATE OF estado ON fact_leads
  FOR EACH ROW EXECUTE FUNCTION cerebro_desde_estado_lead();

DROP TRIGGER IF EXISTS trg_cerebro_venta ON fact_ventas;
CREATE TRIGGER trg_cerebro_venta
  AFTER INSERT ON fact_ventas
  FOR EACH ROW EXECUTE FUNCTION cerebro_desde_venta();

-- ── Historia previa ───────────────────────────────────────────────────────
-- Lo que ya pasó antes de existir esta tabla. Idempotente por el índice único.

INSERT INTO cerebro_entradas (entidad_tipo, entidad_id, fuente, titulo, contenido, autor_id, ocurrio_at, metadata, origen_tabla, origen_id)
SELECT 'lead', i.lead_id, 'interaccion', 'Contacto por ' || i.tipo, i.contenido, i.integrante_id, i.created_at,
       jsonb_build_object('tipo', i.tipo, 'respondio', i.respondio), 'interacciones_lead', i.id
FROM interacciones_lead i
ON CONFLICT (origen_tabla, origen_id) DO NOTHING;

INSERT INTO cerebro_entradas (entidad_tipo, entidad_id, fuente, titulo, contenido, ocurrio_at, metadata, origen_tabla, origen_id)
SELECT CASE WHEN m.lead_id IS NOT NULL THEN 'lead' ELSE 'cliente' END,
       COALESCE(m.lead_id, m.cliente_id), 'whatsapp',
       CASE WHEN m.direccion = 'in' THEN 'WhatsApp recibido' ELSE 'WhatsApp enviado' END,
       m.texto, m.created_at,
       jsonb_build_object('direccion', m.direccion, 'es_bot', m.es_bot), 'mensajes_wa', m.id
FROM mensajes_wa m
ON CONFLICT (origen_tabla, origen_id) DO NOTHING;

INSERT INTO cerebro_entradas (entidad_tipo, entidad_id, fuente, titulo, contenido, ocurrio_at, metadata, origen_tabla, origen_id)
SELECT CASE WHEN r.lead_id IS NOT NULL THEN 'lead' ELSE 'cliente' END,
       COALESCE(r.lead_id, r.cliente_id), 'reunion', 'Reunión',
       COALESCE(r.resumen, r.proximos_pasos), r.fecha,
       jsonb_build_object('duracion_min', r.duracion_min, 'proximos_pasos', r.proximos_pasos), 'reuniones', r.id
FROM reuniones r
WHERE r.lead_id IS NOT NULL OR r.cliente_id IS NOT NULL
ON CONFLICT (origen_tabla, origen_id) DO NOTHING;

INSERT INTO cerebro_entradas (entidad_tipo, entidad_id, fuente, titulo, ocurrio_at, metadata, origen_tabla, origen_id)
SELECT 'cliente', v.cliente_id, 'venta', 'Venta registrada', v.created_at, to_jsonb(v) - 'id', 'fact_ventas', v.id
FROM fact_ventas v
WHERE v.cliente_id IS NOT NULL
ON CONFLICT (origen_tabla, origen_id) DO NOTHING;

-- Alta de cada cliente: el hito que abre su bitácora.
INSERT INTO cerebro_entradas (entidad_tipo, entidad_id, fuente, titulo, contenido, ocurrio_at, metadata, origen_tabla, origen_id)
SELECT 'cliente', c.id, 'sistema', 'Cliente incorporado', c.notas, c.created_at,
       jsonb_build_object('nicho', c.nicho, 'localidad', c.localidad, 'estado', c.estado),
       'dim_clientes', c.id
FROM dim_clientes c
ON CONFLICT (origen_tabla, origen_id) DO NOTHING;

-- ── Timeline con el nombre de la entidad resuelto ─────────────────────────
DROP VIEW IF EXISTS cerebro_timeline;
CREATE VIEW cerebro_timeline WITH (security_invoker = true) AS
SELECT
  e.id,
  e.entidad_tipo,
  e.entidad_id,
  COALESCE(l.nombre_negocio, c.nombre_negocio, p.nombre, 'Equipo') AS entidad_nombre,
  e.fuente,
  e.titulo,
  e.contenido,
  e.autor_id,
  i.nombre AS autor_nombre,
  e.ocurrio_at,
  e.metadata
FROM cerebro_entradas e
LEFT JOIN fact_leads     l ON e.entidad_tipo = 'lead'     AND l.id = e.entidad_id
LEFT JOIN dim_clientes   c ON e.entidad_tipo = 'cliente'  AND c.id = e.entidad_id
LEFT JOIN dim_proyectos  p ON e.entidad_tipo = 'proyecto' AND p.id = e.entidad_id
LEFT JOIN dim_integrantes i ON i.id = e.autor_id;

GRANT SELECT ON cerebro_timeline TO authenticated;
