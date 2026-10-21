-- Tres cosas que pidió Cristian (18-oct), en una migración porque van en un solo PR:
--
-- 1. MAPA DE LEADS: cada lead guarda dónde está (lat/lng). El scraper ya abre la
--    ficha de Google Maps y su URL trae las coordenadas (`!3d<lat>!4d<lng>`); desde
--    ahora las guarda. Los leads viejos se rellenan una vez con
--    `scraper/rellenar_coordenadas.py`. Sin API pagada de Google.
-- 2. FEED DEL EQUIPO: publicaciones (texto y/o link con su vista previa), reacciones,
--    comentarios y colecciones compartidas («ideas para landings», «referencias»…).
-- 3. NOTICIAS: las publicaciones con tipo 'noticia' las escribe un agente (el radar
--    semanal) por la API de agentes; se ven en la pestaña «Afuera» del feed.
--
-- Todo el equipo ve todo (es conocimiento compartido). Cada uno borra o edita solo
-- lo suyo. Los agentes escriben con service role desde /api/agentes/*.

-- ── 1. Coordenadas de los leads ────────────────────────────────────────────────
ALTER TABLE fact_leads ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE fact_leads ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE fact_leads DROP CONSTRAINT IF EXISTS fact_leads_coordenadas_validas;
-- Las dos o ninguna. Ojo: con una sola en NULL, `lng BETWEEN …` da NULL y un CHECK
-- deja pasar NULL; por eso se exige NOT NULL explícito en la segunda rama.
ALTER TABLE fact_leads ADD CONSTRAINT fact_leads_coordenadas_validas CHECK (
  (lat IS NULL AND lng IS NULL)
  OR (lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS fact_leads_con_coordenadas_idx
  ON fact_leads (estado) WHERE lat IS NOT NULL AND eliminado_at IS NULL;

-- ── 2 y 3. Publicaciones ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publicaciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             TEXT NOT NULL DEFAULT 'post' CHECK (tipo IN ('post', 'noticia')),
  -- Quien publica: una persona del equipo, o un agente (noticias del radar).
  autor_id         UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  agente_id        UUID REFERENCES agentes(id) ON DELETE SET NULL,
  texto            TEXT CHECK (texto IS NULL OR char_length(texto) <= 4000),
  url              TEXT CHECK (url IS NULL OR (url ~* '^https?://' AND char_length(url) <= 2000)),
  -- Vista previa del link (Open Graph), sacada en el servidor al publicar.
  url_titulo       TEXT,
  url_descripcion  TEXT,
  url_imagen       TEXT,
  url_sitio        TEXT,
  -- Para las noticias: de dónde salió («radar semanal», el medio…).
  fuente           TEXT CHECK (fuente IS NULL OR char_length(fuente) <= 120),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  editado_at       TIMESTAMPTZ,
  eliminado_at     TIMESTAMPTZ,
  CONSTRAINT publicaciones_con_contenido CHECK (texto IS NOT NULL OR url IS NOT NULL),
  CONSTRAINT publicaciones_con_autor CHECK (autor_id IS NOT NULL OR agente_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS publicaciones_recientes_idx
  ON publicaciones (tipo, created_at DESC) WHERE eliminado_at IS NULL;
-- La misma noticia no entra dos veces aunque el radar la encuentre otra semana.
CREATE UNIQUE INDEX IF NOT EXISTS publicaciones_noticia_unica_idx
  ON publicaciones (url) WHERE tipo = 'noticia' AND eliminado_at IS NULL;

CREATE TABLE IF NOT EXISTS publicacion_reacciones (
  publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  emoji          TEXT NOT NULL CHECK (emoji IN ('🔥', '💡', '👏', '😂', '👀')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (publicacion_id, integrante_id, emoji)
);

CREATE TABLE IF NOT EXISTS publicacion_comentarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  autor_id       UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  texto          TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 2000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminado_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS publicacion_comentarios_idx
  ON publicacion_comentarios (publicacion_id, created_at) WHERE eliminado_at IS NULL;

CREATE TABLE IF NOT EXISTS colecciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  creada_por  UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS colecciones_nombre_unico_idx ON colecciones (lower(nombre));

CREATE TABLE IF NOT EXISTS coleccion_items (
  coleccion_id   UUID NOT NULL REFERENCES colecciones(id) ON DELETE CASCADE,
  publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  agregado_por   UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coleccion_id, publicacion_id)
);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE publicaciones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE publicacion_reacciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE publicacion_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE colecciones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE coleccion_items         ENABLE ROW LEVEL SECURITY;

-- Leer: todo el equipo activo.
CREATE POLICY publicaciones_leer ON publicaciones FOR SELECT TO authenticated USING (is_integrante());
CREATE POLICY reacciones_leer ON publicacion_reacciones FOR SELECT TO authenticated USING (is_integrante());
CREATE POLICY comentarios_leer ON publicacion_comentarios FOR SELECT TO authenticated USING (is_integrante());
CREATE POLICY colecciones_leer ON colecciones FOR SELECT TO authenticated USING (is_integrante());
CREATE POLICY coleccion_items_leer ON coleccion_items FOR SELECT TO authenticated USING (is_integrante());

-- Publicar: solo posts, solo a nombre propio. Las noticias entran por la API de agentes.
CREATE POLICY publicaciones_crear ON publicaciones FOR INSERT TO authenticated
  WITH CHECK (is_integrante() AND tipo = 'post' AND autor_id = mi_integrante_id() AND agente_id IS NULL);
-- Editar o borrar (eliminado_at): solo lo propio.
CREATE POLICY publicaciones_editar ON publicaciones FOR UPDATE TO authenticated
  USING (autor_id = mi_integrante_id()) WITH CHECK (autor_id = mi_integrante_id() AND tipo = 'post');

CREATE POLICY reacciones_crear ON publicacion_reacciones FOR INSERT TO authenticated
  WITH CHECK (is_integrante() AND integrante_id = mi_integrante_id());
CREATE POLICY reacciones_borrar ON publicacion_reacciones FOR DELETE TO authenticated
  USING (integrante_id = mi_integrante_id());

CREATE POLICY comentarios_crear ON publicacion_comentarios FOR INSERT TO authenticated
  WITH CHECK (is_integrante() AND autor_id = mi_integrante_id());
CREATE POLICY comentarios_borrar ON publicacion_comentarios FOR UPDATE TO authenticated
  USING (autor_id = mi_integrante_id()) WITH CHECK (autor_id = mi_integrante_id());

-- Colecciones del equipo: cualquiera crea y agrega; saca solo lo que agregó él.
CREATE POLICY colecciones_crear ON colecciones FOR INSERT TO authenticated
  WITH CHECK (is_integrante() AND creada_por = mi_integrante_id());
CREATE POLICY coleccion_items_crear ON coleccion_items FOR INSERT TO authenticated
  WITH CHECK (is_integrante() AND agregado_por = mi_integrante_id());
CREATE POLICY coleccion_items_borrar ON coleccion_items FOR DELETE TO authenticated
  USING (agregado_por = mi_integrante_id());

-- Nadie anónimo toca nada de esto; borrar filas de verdad no se hace desde el cliente.
REVOKE ALL ON publicaciones, publicacion_reacciones, publicacion_comentarios, colecciones, coleccion_items FROM anon;
REVOKE DELETE ON publicaciones, publicacion_comentarios, colecciones FROM authenticated;
