-- El cerebro deja de ser ciego a la conversación.
--
-- La 020 lo alimenta con lo que pasa DENTRO de la base: mensajes, ventas,
-- reuniones, cambios de estado. Pero las decisiones del equipo no se toman ahí:
-- se toman en #chatia (Discord), en los PR y en las sesiones de trabajo. Sin eso,
-- la bitácora cuenta QUÉ pasó y nunca POR QUÉ.
--
-- Esta migración abre tres fuentes externas y agrega la llave para importarlas
-- sin duplicar. No crea triggers: lo externo entra por la ingesta on-demand
-- (scripts/ingesta-cerebro.mjs), cuando trabajamos en Tryvex.

-- ── Fuentes nuevas ────────────────────────────────────────────────────────
-- chatia   → lo hablado y decidido en el canal del equipo
-- github   → PR mergeados: lo que efectivamente se construyó
-- contexto → lo fundacional: qué es Tryvex, cómo trabajamos, quién hace qué
ALTER TABLE cerebro_entradas DROP CONSTRAINT IF EXISTS cerebro_entradas_fuente_check;
ALTER TABLE cerebro_entradas ADD CONSTRAINT cerebro_entradas_fuente_check
  CHECK (fuente IN (
    'whatsapp','interaccion','reunion','venta','estado','nota','scraper','sistema',
    'chatia','github','contexto'
  ));

-- ── Llave de origen para lo que no vive en esta base ──────────────────────
-- origen_id es UUID y no acepta un snowflake de Discord ni un número de PR.
-- origen_ref guarda esa clave externa tal cual viene, en texto.
ALTER TABLE cerebro_entradas ADD COLUMN IF NOT EXISTS origen_ref TEXT;

-- Quién lo dijo, cuando no es un integrante del CRM: Ariel y Spike son agentes
-- del equipo pero no tienen fila en dim_integrantes.
ALTER TABLE cerebro_entradas ADD COLUMN IF NOT EXISTS autor_externo TEXT;

-- Índice TOTAL, no parcial: la 020 ya cobró esa lección con un 42P10 — ON CONFLICT
-- solo reconoce un índice parcial si la cláusula repite su predicado. Las entradas
-- de la base llevan origen_ref NULL y no colisionan entre sí, porque Postgres trata
-- cada NULL como distinto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cerebro_origen_ref
  ON cerebro_entradas (origen_tabla, origen_ref);

-- ── El timeline ahora muestra también al autor externo ────────────────────
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
  -- Integrante del CRM si lo hay; si no, el nombre con que firmó afuera.
  COALESCE(i.nombre, e.autor_externo) AS autor_nombre,
  e.ocurrio_at,
  e.metadata
FROM cerebro_entradas e
LEFT JOIN fact_leads     l ON e.entidad_tipo = 'lead'     AND l.id = e.entidad_id
LEFT JOIN dim_clientes   c ON e.entidad_tipo = 'cliente'  AND c.id = e.entidad_id
LEFT JOIN dim_proyectos  p ON e.entidad_tipo = 'proyecto' AND p.id = e.entidad_id
LEFT JOIN dim_integrantes i ON i.id = e.autor_id;

GRANT SELECT ON cerebro_timeline TO authenticated;
