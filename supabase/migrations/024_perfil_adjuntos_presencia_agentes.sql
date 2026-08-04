-- Cuatro cosas que van juntas porque tocan lo mismo: quién es cada uno en el chat.
--
--   1. Foto de perfil        — bucket + poder subirla desde ajustes.
--   2. Adjuntos en el chat   — bucket + una fila por archivo enviado.
--   3. Disponibilidad real   — sale del turno marcado y del calendario, no de un flag.
--   4. Chat de agentes       — el canal donde después migra #chatia.
--
-- Sin format() ni bloques DO encadenados: el SQL Editor de Supabase los mutila
-- (42601) y, como corre todo en una transacción, un error revierte el archivo
-- entero. Aprendido con la 022 y la 023.

-- ══ 1 · Foto de perfil ════════════════════════════════════════════════════
-- Público en lectura: un avatar se muestra en cada mensaje y firmar una URL por
-- cada burbuja sería caro y frágil. La escritura pasa por /api/perfil/avatar con
-- service role, así que nadie sube directo al bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatares', 'avatares', true)
ON CONFLICT (id) DO NOTHING;

-- ══ 2 · Adjuntos del chat ═════════════════════════════════════════════════
-- Privado: acá viaja lo que el equipo se manda entre sí. Se sirve por URL firmada.
INSERT INTO storage.buckets (id, name, public)
VALUES ('adjuntos-chat', 'adjuntos-chat', false)
ON CONFLICT (id) DO NOTHING;

-- Un mensaje puede llevar varios archivos, así que es tabla y no columnas: una
-- columna `url` obligaría a un mensaje por imagen.
CREATE TABLE IF NOT EXISTS mensaje_adjuntos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id   UUID NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  ruta         TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  tipo_mime    TEXT NOT NULL,
  bytes        BIGINT NOT NULL,
  -- Se guardan al subir: sin esto la burbuja salta de tamaño cuando carga la imagen.
  ancho        INTEGER,
  alto         INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_mensaje ON mensaje_adjuntos (mensaje_id);

ALTER TABLE mensaje_adjuntos ENABLE ROW LEVEL SECURITY;

-- Se ve el adjunto si se ve el mensaje. La pertenencia ya la resuelve la 019.
DROP POLICY IF EXISTS "ver adjuntos de mis conversaciones" ON mensaje_adjuntos;
-- En una línea a propósito: el SQL Editor de Supabase mutila los paréntesis de
-- una subconsulta repartida en varias líneas y aborta con 42601.
CREATE POLICY "ver adjuntos de mis conversaciones" ON mensaje_adjuntos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM mensajes m WHERE m.id = mensaje_id AND es_miembro_conversacion(m.conversacion_id)));

DROP POLICY IF EXISTS "adjuntar a mi mensaje" ON mensaje_adjuntos;
CREATE POLICY "adjuntar a mi mensaje" ON mensaje_adjuntos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM mensajes m WHERE m.id = mensaje_id AND m.autor_id = mi_integrante_id()));

-- RLS sin GRANT = 42501: Postgres evalúa privilegios ANTES que las policies.
GRANT SELECT, INSERT ON mensaje_adjuntos TO authenticated;

-- El texto deja de ser obligatorio: mandar solo una foto es un mensaje válido.
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_contenido_check;
ALTER TABLE mensajes ALTER COLUMN contenido DROP NOT NULL;

-- ══ 3 · Disponibilidad real ═══════════════════════════════════════════════
-- Antes el estado salía de `activo`, que es un flag administrativo: dice si la
-- persona pertenece al equipo, no si está trabajando ahora. Quedaba "disponible"
-- alguien que se fue hace seis horas.
--
-- Esta vista lo deriva de hechos: el turno abierto en `jornadas` y las reuniones
-- del calendario. Nadie tiene que acordarse de cambiarlo.
CREATE OR REPLACE VIEW presencia_equipo WITH (security_invoker = true) AS
SELECT
  i.id                AS integrante_id,
  i.nombre,
  i.avatar_url,
  i.color,
  i.activo            AS es_del_equipo,
  j.id IS NOT NULL    AS en_turno,
  j.entrada_at        AS turno_desde,
  -- Una pausa abierta es la que tiene inicio y no tiene fin.
  COALESCE(
    (SELECT bool_or(p->>'fin' IS NULL) FROM jsonb_array_elements(j.pausas) p),
    false
  )                   AS en_pausa,
  r.fecha             AS reunion_desde,
  CASE
    WHEN NOT i.activo            THEN 'inactivo'
    WHEN r.id IS NOT NULL        THEN 'en_reunion'
    WHEN j.id IS NULL            THEN 'fuera_de_turno'
    WHEN COALESCE(
           (SELECT bool_or(p->>'fin' IS NULL) FROM jsonb_array_elements(j.pausas) p),
           false
         )                       THEN 'en_pausa'
    ELSE 'disponible'
  END                 AS estado
FROM dim_integrantes i
-- El índice único de la 018 garantiza que hay a lo sumo una jornada abierta.
LEFT JOIN jornadas j
  ON j.integrante_id = i.id AND j.salida_at IS NULL
-- Reunión en curso: empezó y todavía no debería haber terminado. Sin duración
-- declarada se asume una hora, que es lo que dura una reunión por defecto acá.
LEFT JOIN LATERAL (
  SELECT re.id, re.fecha
  FROM reuniones re
  WHERE i.id = ANY(re.asistentes_ids)
    AND re.fecha <= NOW()
    AND NOW() < re.fecha + (COALESCE(re.duracion_min, 60) || ' minutes')::interval
  ORDER BY re.fecha DESC
  LIMIT 1
) r ON true;

GRANT SELECT ON presencia_equipo TO authenticated;

-- ══ 4 · Chat de agentes ═══════════════════════════════════════════════════
-- El canal donde después migra #chatia. Es un tipo propio y no un grupo más
-- porque tiene reglas distintas: entran agentes que no son personas del CRM.
ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS conversaciones_tipo_check;
ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_tipo_check
  CHECK (tipo IN ('dm', 'grupo', 'agentes'));

-- La 019 escribió `CHECK (tipo = 'grupo' OR dm_key IS NOT NULL)`, que en un mundo
-- de dos tipos significaba "el DM necesita su clave". Con un tercer tipo pasa a
-- significar "todo lo que no sea grupo necesita dm_key", y el canal de agentes
-- —que no es ni una cosa ni la otra— quedaba rechazado con 23514.
-- Se reescribe diciendo lo que siempre quiso decir: solo el DM lleva dm_key.
ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS dm_con_key;
ALTER TABLE conversaciones ADD CONSTRAINT dm_con_key
  CHECK (tipo <> 'dm' OR dm_key IS NOT NULL);

-- Un agente no tiene navegador ni sesión: no puede pasar por el login del CRM.
-- Se identifica con un token que vive acá, hasheado. El texto plano se muestra
-- una sola vez al crearlo y no se guarda nunca.
CREATE TABLE IF NOT EXISTS agentes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL UNIQUE,
  descripcion   TEXT,
  color         TEXT,
  avatar_url    TEXT,
  token_hash    TEXT NOT NULL UNIQUE,
  activo        BOOLEAN NOT NULL DEFAULT true,
  ultimo_uso_at TIMESTAMPTZ,
  creado_por    UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agentes ENABLE ROW LEVEL SECURITY;

-- El equipo ve quiénes son los agentes; el token nunca sale de la base porque
-- lo que se guarda es su hash.
DROP POLICY IF EXISTS "ver agentes" ON agentes;
CREATE POLICY "ver agentes" ON agentes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM dim_integrantes WHERE auth_user_id = auth.uid() AND activo = true));

GRANT SELECT ON agentes TO authenticated;

-- Quién escribió: una persona o un agente. Uno de los dos, nunca ambos ni ninguno.
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS agente_id UUID REFERENCES agentes(id) ON DELETE SET NULL;
ALTER TABLE mensajes ALTER COLUMN autor_id DROP NOT NULL;

ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensaje_tiene_un_autor;
ALTER TABLE mensajes ADD CONSTRAINT mensaje_tiene_un_autor
  CHECK ((autor_id IS NOT NULL) <> (agente_id IS NOT NULL));

-- El hilo del equipo agéntico, listo para cuando migre #chatia.
INSERT INTO conversaciones (tipo, nombre)
SELECT 'agentes', 'Equipo agéntico'
WHERE NOT EXISTS (SELECT 1 FROM conversaciones WHERE tipo = 'agentes' AND nombre = 'Equipo agéntico');

INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
SELECT c.id, i.id
FROM conversaciones c
CROSS JOIN dim_integrantes i
WHERE c.tipo = 'agentes' AND c.nombre = 'Equipo agéntico' AND i.activo = true
ON CONFLICT DO NOTHING;

-- Los adjuntos también en vivo, como el resto (023).
ALTER PUBLICATION supabase_realtime ADD TABLE mensaje_adjuntos;
ALTER TABLE mensaje_adjuntos REPLICA IDENTITY FULL;
