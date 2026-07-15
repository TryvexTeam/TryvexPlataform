-- 014: Loop agente-a-agente — el pipeline de `tareas` como fuente unica de verdad.
-- Disenado entre Jarvis y Ariel (15-jul) sobre la PROPUESTA#011. Encargo de Ignacio y Cristian.
-- Reusa tareas/dim_integrantes/subtareas. Idempotente. Mismo patron que la 012/013:
-- el equipo autenticado LEE, el server (service_role) ESCRIBE.
--
-- ⚠️  NO APLICAR SIN FIRMA HUMANA. Esta migracion define el gate humano;
--     estrenarla saltandose el gate seria el peor debut posible.
--     Requiere revision de Ariel + Spike y firma de Cristian/Ignacio.

-- ============================================================================
-- (a) Identidad de agente — Jarvis, Ariel y Spike como integrantes de verdad.
--     Sin esto, `created_by` y `tarea_responsables` no pueden decir quien hizo que.
--     auth_user_id queda NULL: un agente no es un usuario de auth.
-- ============================================================================
ALTER TABLE dim_integrantes ADD COLUMN IF NOT EXISTS es_agente BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN dim_integrantes.es_agente IS
  'TRUE = integrante no humano (agente IA). No tiene auth_user_id; opera via service_role.';

-- ============================================================================
-- (b) Estados del loop — el CHECK actual no puede representar la regla de oro
--     ("nada se entrega sin evidencia"). Se amplia:
--       sin_empezar -> en_curso -> probada -> listo
--                          \-> bloqueada (espera firma humana o desbloqueo)
--     `listo` pasa a significar entregada-y-firmada.
-- ============================================================================
-- `huerfana`: el agente se murio/cerro sesion con la tarea tomada (review de Ariel, ronda 1).
-- Sin esto, la primera tarea que alguien deje colgada queda en_curso para siempre.
ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_estado_check;
ALTER TABLE tareas ADD CONSTRAINT tareas_estado_check
  CHECK (estado IN ('sin_empezar','en_curso','bloqueada','probada','listo','huerfana'));

-- Heartbeat: el runner que tiene la tarea lo actualiza mientras vive.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS ttl_segundos INTEGER NOT NULL DEFAULT 900;

-- Quien ejecuto y quien valido. Ajuste de Ariel: el que ejecuta NO valida.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS ejecutado_por UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS validado_por  UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL;

-- Doble firma cruzada: reviewer != implementer. Se valida en la fila misma.
ALTER TABLE tareas DROP CONSTRAINT IF EXISTS chk_tareas_firma_cruzada;
ALTER TABLE tareas ADD CONSTRAINT chk_tareas_firma_cruzada
  CHECK (validado_por IS NULL OR ejecutado_por IS NULL OR validado_por <> ejecutado_por);

-- Gate humano: lo irreversible (prod, plata, leads reales, borrar) no se cierra solo.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS requiere_firma_humana BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS firmada_por UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS firmada_at  TIMESTAMPTZ;

-- Presupuesto por tarea (ajuste de Ariel): bajo el tope no molestamos,
-- sobre el tope la tarea se bloquea sola.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS presupuesto_max NUMERIC(10,4);
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS gasto_actual    NUMERIC(10,4) NOT NULL DEFAULT 0;

-- Retro obligatoria al cerrar (vista que pidio Ariel: que aprendimos / que hariamos distinto).
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS retro TEXT;

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS bloqueo_motivo TEXT;

CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(estado, updated_at);
CREATE INDEX IF NOT EXISTS idx_tareas_cola   ON tareas(estado, prioridad) WHERE estado IN ('sin_empezar','en_curso');

-- ============================================================================
-- (c) tarea_evidencias — ajuste de Ariel: TABLA, no columna.
--     Una tarea tiene N pruebas y ninguna se pisa.
--     Sin evidencia no se puede pasar a `probada` (se impone en el trigger (d)).
-- ============================================================================
CREATE TABLE IF NOT EXISTS tarea_evidencias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id      UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('exit_code','screenshot','url','log','test')),
  -- Evidencia vacia no es evidencia (review de Ariel, ronda 2).
  payload       TEXT NOT NULL CHECK (btrim(payload) <> ''),
  descripcion   TEXT,
  created_by    UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidencias_tarea ON tarea_evidencias(tarea_id, created_at);

COMMENT ON TABLE tarea_evidencias IS
  'Prueba objetiva de que una tarea funciona. Regla de oro del loop: sin evidencia no hay entrega.';

-- ============================================================================
-- (d) Los constraints que hacen incomodo el mentir.
--     CHECK no puede hacer subqueries -> trigger.
-- ============================================================================
CREATE OR REPLACE FUNCTION tareas_guardia_loop()
RETURNS TRIGGER AS $$
DECLARE
  -- En INSERT no hay OLD: la tarea "viene de" sin_empezar (review de Ariel, ronda 2 — CRITICO:
  -- sin esto, un INSERT directo en 'listo' nacia entregado saltandose todas las reglas).
  estado_previo TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'sin_empezar' ELSE OLD.estado END;
  firmada_previa UUID := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.firmada_por END;
BEGIN
  -- 0. Nadie nace probado ni entregado.
  IF TG_OP = 'INSERT' AND NEW.estado IN ('probada','listo') THEN
    RAISE EXCEPTION 'Una tarea no puede nacer en estado %: el ciclo empieza en sin_empezar/en_curso', NEW.estado;
  END IF;

  -- 0-bis. Firma ANTES de ejecutar (review de Ariel, ronda 2 — DISENO):
  -- lo irreversible no se firma al entregar, se firma antes de tocarlo.
  -- Cuando pedimos firma al final, el deploy/el mensaje al lead ya salio.
  IF NEW.estado = 'en_curso' AND estado_previo <> 'en_curso'
     AND NEW.requiere_firma_humana AND NEW.firmada_por IS NULL THEN
    RAISE EXCEPTION 'Tarea % requiere firma humana ANTES de ejecutarse (irreversible): queda en bloqueada hasta el pulgar', NEW.id;
  END IF;

  -- 1. `probada` exige al menos una evidencia registrada.
  IF NEW.estado = 'probada' AND (estado_previo IS DISTINCT FROM 'probada') THEN
    IF NOT EXISTS (SELECT 1 FROM tarea_evidencias WHERE tarea_id = NEW.id) THEN
      RAISE EXCEPTION 'Tarea % no puede pasar a probada: no tiene evidencia registrada', NEW.id;
    END IF;
    IF NEW.validado_por IS NULL THEN
      RAISE EXCEPTION 'Tarea % no puede pasar a probada: falta validado_por (doble firma cruzada)', NEW.id;
    END IF;
  END IF;

  -- 2. `listo` (entregada) exige haber pasado por probada + retro escrita.
  IF NEW.estado = 'listo' AND (estado_previo IS DISTINCT FROM 'listo') THEN
    IF estado_previo <> 'probada' THEN
      RAISE EXCEPTION 'Tarea % no puede entregarse: debe pasar por probada primero (estado actual: %)', NEW.id, estado_previo;
    END IF;
    IF NEW.retro IS NULL OR btrim(NEW.retro) = '' THEN
      RAISE EXCEPTION 'Tarea % no puede entregarse: falta la retro', NEW.id;
    END IF;
    -- 3. Gate humano: lo irreversible necesita pulgar.
    IF NEW.requiere_firma_humana AND NEW.firmada_por IS NULL THEN
      RAISE EXCEPTION 'Tarea % requiere firma humana y no esta firmada', NEW.id;
    END IF;
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
  END IF;

  -- 4. Un agente no puede firmar por un humano.
  IF NEW.firmada_por IS NOT NULL AND NEW.firmada_por IS DISTINCT FROM firmada_previa THEN
    IF EXISTS (SELECT 1 FROM dim_integrantes WHERE id = NEW.firmada_por AND es_agente) THEN
      RAISE EXCEPTION 'La firma humana de la tarea % no puede venir de un agente', NEW.id;
    END IF;
    NEW.firmada_at := COALESCE(NEW.firmada_at, NOW());
  END IF;

  -- 5. Presupuesto: sobre el tope se bloquea sola.
  IF NEW.presupuesto_max IS NOT NULL AND NEW.gasto_actual > NEW.presupuesto_max
     AND NEW.estado NOT IN ('listo','bloqueada') THEN
    NEW.estado := 'bloqueada';
    NEW.bloqueo_motivo := format('Presupuesto excedido: %s de %s', NEW.gasto_actual, NEW.presupuesto_max);
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tareas_guardia_loop ON tareas;
CREATE TRIGGER trg_tareas_guardia_loop
  BEFORE INSERT OR UPDATE ON tareas
  FOR EACH ROW EXECUTE FUNCTION tareas_guardia_loop();

-- ============================================================================
-- (d-bis) Huerfanas y claim atomico — review de Ariel, ronda 1.
--     Un agente que se cae no puede dejar la cola trancada, y dos agentes no
--     pueden tomar la misma tarea.
-- ============================================================================

-- Marca huerfana toda tarea en_curso cuyo heartbeat vencio (last_seen_at + ttl).
CREATE OR REPLACE FUNCTION marcar_huerfanas()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  WITH vencidas AS (
    UPDATE tareas
       SET estado = 'huerfana',
           bloqueo_motivo = format('Heartbeat vencido: sin señal hace mas de %s s', ttl_segundos)
     WHERE estado = 'en_curso'
       -- COALESCE: una tarea puesta en_curso a mano (sin heartbeat) tambien vence (review Ariel r2)
       AND COALESCE(last_seen_at, updated_at) < NOW() - (ttl_segundos || ' seconds')::INTERVAL
    RETURNING 1
  )
  SELECT count(*) INTO n FROM vencidas;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- Claim atomico: dos runners pueden llamar esto a la vez y solo UNO se lleva la tarea.
-- FOR UPDATE SKIP LOCKED es lo que evita el trabajo duplicado que marca Ariel.
CREATE OR REPLACE FUNCTION reclamar_tarea(p_agente UUID)
RETURNS SETOF tareas AS $$
BEGIN
  RETURN QUERY
  WITH siguiente AS (
    SELECT id FROM tareas
     WHERE estado IN ('sin_empezar','huerfana')
       -- lo irreversible sin firmar no entra a la cola de ejecucion (review Ariel r2)
       AND NOT (requiere_firma_humana AND firmada_por IS NULL)
     ORDER BY CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE tareas t
     SET estado = 'en_curso',
         ejecutado_por = p_agente,
         last_seen_at = NOW(),
         bloqueo_motivo = NULL
    FROM siguiente s
   WHERE t.id = s.id
  RETURNING t.*;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reclamar_tarea(UUID) IS
  'Claim atomico de la cola. SKIP LOCKED garantiza que dos runners no tomen la misma tarea.';

-- ============================================================================
-- (e) RLS + grants — mismo patron que la 012/013.
-- ============================================================================
ALTER TABLE tarea_evidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidencias_select ON tarea_evidencias;
CREATE POLICY evidencias_select ON tarea_evidencias FOR SELECT TO authenticated USING (true);

GRANT SELECT ON tarea_evidencias TO authenticated;
GRANT ALL ON tarea_evidencias TO service_role;
GRANT EXECUTE ON FUNCTION reclamar_tarea(UUID), marcar_huerfanas() TO service_role;

-- ⚠️ DEUDA DE SEGURIDAD CONOCIDA (gap #3 de Spike, confirmado por Ariel):
-- estas policies son INERTES mientras los 3 agentes compartan `service_role`,
-- porque service_role bypasea RLS por diseno. Aislar credenciales por agente NO
-- se arregla en una migracion: requiere JWT por agente (claim agent_id) o roles
-- de Postgres separados, + cambio en cada infra. Va como 015 + tarea de infra.
-- Se deja escrito para que no se pierda ni se venda como resuelto.

-- ============================================================================
-- (f) Vista de la bandeja de firmas — lo que el jefe ve en el celular.
-- ============================================================================
CREATE OR REPLACE VIEW v_bandeja_firmas AS
SELECT
  t.id,
  t.titulo,
  t.descripcion,
  t.prioridad,
  t.bloqueo_motivo,
  t.gasto_actual,
  t.presupuesto_max,
  ej.nombre AS ejecutado_por_nombre,
  va.nombre AS validado_por_nombre,
  (SELECT count(*) FROM tarea_evidencias e WHERE e.tarea_id = t.id) AS n_evidencias,
  t.updated_at
FROM tareas t
LEFT JOIN dim_integrantes ej ON ej.id = t.ejecutado_por
LEFT JOIN dim_integrantes va ON va.id = t.validado_por
WHERE t.requiere_firma_humana
  AND t.firmada_por IS NULL
  AND t.estado IN ('bloqueada','probada');

GRANT SELECT ON v_bandeja_firmas TO authenticated;

-- ============================================================================
-- (g) Semilla de agentes. Idempotente por email.
--     NOTA PARA REVISION: los emails son placeholders; confirmar dominio con Cristian.
-- ============================================================================
INSERT INTO dim_integrantes (nombre, email, rol_principal, especialidad, es_agente, activo)
VALUES
  ('Jarvis', 'jarvis@tryvex.tech', 'agente', 'Orquestacion, cara al cliente interno, memoria', TRUE, TRUE),
  ('Ariel',  'ariel@tryvex.tech',  'agente', 'Ejecucion en VPS, infraestructura, runner del loop', TRUE, TRUE),
  ('Spike',  'spike@tryvex.tech',  'agente', 'Infraestructura AWS, automatizacion', TRUE, TRUE)
ON CONFLICT (email) DO NOTHING;
