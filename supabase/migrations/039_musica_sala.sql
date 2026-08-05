-- Musica compartida dentro de las llamadas.
--
-- Decision de arquitectura, y es la unica que importa entender: NO hay un bot.
--
-- Un bot de musica de Discord funciona porque el bot es un participante mas de
-- la sala y transmite audio. Eso exige un servidor prendido las 24 horas
-- decodificando y empujando bytes. Nuestras llamadas son una malla P2P entre
-- navegadores (ver la 033) y por eso son gratis e ilimitadas; meter un bot en el
-- medio destruiria justo esa propiedad -- pasariamos de $0 a pagar un servidor
-- de medios por el capricho de poner musica.
--
-- Asi que se da vuelta el modelo: cada navegador reproduce la MISMA pista en la
-- MISMA posicion. Esta tabla no guarda audio ni lo retransmite: guarda un puntero
-- (que suena) y un reloj (desde cuando). Cada cliente calcula
--
--     posicion = (ahora - empezo_at) + offset_seg
--
-- y salta ahi. Quedan sincronizados sin que nadie retransmita nada. Cero
-- infraestructura, cero costo, y la musica no se mezcla en el microfono de nadie
-- -- el codec de la llamada esta optimizado para voz y la musica por ahi suena
-- pesima.
--
-- La reproduccion la hace el IFrame Player oficial de YouTube en cada navegador.
-- Nunca se extrae el audio ni se reproduce fuera de ese reproductor: eso es
-- exactamente lo que le cerraron a Groovy y a Rythm.

-- == 1 - La sala =============================================================
-- Una fila por conversacion, no una por sesion de escucha. La sala es un estado,
-- no un evento: "que esta sonando en este hilo ahora". La PK es la conversacion
-- justamente para que sea imposible tener dos salas compitiendo por el mismo
-- hilo -- ese bug seria dos personas escuchando cosas distintas creyendo que
-- escuchan lo mismo, y es indetectable desde adentro.
CREATE TABLE IF NOT EXISTS sala_musica (
  conversacion_id  UUID PRIMARY KEY REFERENCES conversaciones(id) ON DELETE CASCADE,

  -- La pista actual, desnormalizada. Se guarda el titulo y el canal y no solo el
  -- video_id porque la cola se pinta en pantalla y resolver diez titulos contra
  -- la API de YouTube en cada render quemaria la cuota diaria en una tarde.
  video_id         TEXT,
  titulo           TEXT,
  canal            TEXT,
  duracion_seg     INTEGER,
  miniatura_url    TEXT,

  -- Lo que viene despues. JSONB y no una tabla hija a proposito: la cola se lee y
  -- se reescribe entera en cada comando (encolar, saltar, mezclar) y siempre
  -- pertenece a una sola sala. Una tabla aparte obligaria a manejar el orden con
  -- una columna de posicion y a renumerarla en cada shuffle, sin ganar nada.
  cola             JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Lo que ya sono, la mas reciente primero. Existe solo para que `previous`
  -- tenga a donde volver: sin esto, "atras" no tiene significado posible.
  historial        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- El reloj de la sincronizacion. `empezo_at` es cuando el servidor arranco (o
  -- reanudo) la pista; `offset_seg` es desde que segundo de la pista lo hizo.
  -- Pausar congela la posicion alcanzada en `offset_seg`; reanudar reinicia
  -- `empezo_at` conservando ese offset. Los dos campos juntos son la unica fuente
  -- de verdad de "en que segundo va esto".
  empezo_at        TIMESTAMPTZ,
  offset_seg       INTEGER NOT NULL DEFAULT 0,
  pausado          BOOLEAN NOT NULL DEFAULT false,

  -- off   = al terminar la cola, silencio
  -- pista = repite la actual para siempre
  -- cola  = la que termina se va al final de la cola
  modo_loop        TEXT NOT NULL DEFAULT 'off'
                   CHECK (modo_loop IN ('off', 'pista', 'cola')),

  -- Quien la puso. Se muestra al lado del titulo: en un equipo, saber quien puso
  -- la cancion es la mitad de la gracia. ON DELETE SET NULL porque la musica no
  -- deja de sonar porque alguien se dio de baja.
  puesta_por       UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,

  actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- == 2 - Cache de busquedas ==================================================
-- Esta tabla es lo unico que hace viable la funcion.
--
-- `search.list` de la YouTube Data API cuesta 100 unidades y la cuota diaria es
-- de 10.000: exactamente 100 busquedas por dia para TODO el equipo, y no se puede
-- comprar mas. Sin cache, cinco personas buscando canciones un viernes dejan la
-- funcion muerta hasta el dia siguiente, y muerta de la peor manera -- con un
-- error de cuota que no se parece en nada a "buscaste demasiado".
--
-- La consulta se normaliza (minusculas, sin espacios de sobra) antes de usarse
-- como clave, porque "Bohemian Rhapsody" y "bohemian  rhapsody" son la misma
-- busqueda y cobrarlas dos veces seria regalar la mitad de la cuota.
--
-- Pegar una URL directa no pasa por aca ni por `search.list`: `videos.list`
-- cuesta 1 unidad. Por eso el buscador siempre acepta URLs, incluso sin cuota.
CREATE TABLE IF NOT EXISTS musica_busquedas (
  consulta    TEXT PRIMARY KEY,
  resultados  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Para poder barrer lo viejo algun dia sin escanear la tabla entera.
CREATE INDEX IF NOT EXISTS idx_musica_busquedas_fecha
  ON musica_busquedas (created_at DESC);

-- == 3 - Permisos ============================================================
-- La sala se ve y se maneja si uno es miembro de la conversacion, igual que las
-- llamadas en la 033. El salto de sala a conversacion se hace aca dentro y no en
-- el cliente: si dependiera de lo que manda el front, cualquiera podria mirar (y
-- pausar) la musica de un DM ajeno.
ALTER TABLE sala_musica ENABLE ROW LEVEL SECURITY;
ALTER TABLE musica_busquedas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver la sala de mis conversaciones" ON sala_musica;
CREATE POLICY "ver la sala de mis conversaciones"
  ON sala_musica FOR SELECT TO authenticated
  USING (es_miembro_conversacion(conversacion_id));

DROP POLICY IF EXISTS "abrir la sala de mis conversaciones" ON sala_musica;
CREATE POLICY "abrir la sala de mis conversaciones"
  ON sala_musica FOR INSERT TO authenticated
  WITH CHECK (es_miembro_conversacion(conversacion_id));

-- Cualquier miembro maneja la musica, no solo quien la puso. Es deliberado y es
-- como se comporta un bot de musica: si alguien pone algo insoportable y se va a
-- almorzar, el resto tiene que poder saltarlo.
DROP POLICY IF EXISTS "manejar la sala de mis conversaciones" ON sala_musica;
CREATE POLICY "manejar la sala de mis conversaciones"
  ON sala_musica FOR UPDATE TO authenticated
  USING (es_miembro_conversacion(conversacion_id))
  WITH CHECK (es_miembro_conversacion(conversacion_id));

-- El cache no es de nadie: es un espejo de respuestas publicas de YouTube. Que
-- sea comun a todo el equipo es justamente el punto -- si cada uno tuviera el
-- suyo, la cuota se gastaria igual de rapido que sin cache.
DROP POLICY IF EXISTS "leer el cache de busquedas" ON musica_busquedas;
CREATE POLICY "leer el cache de busquedas"
  ON musica_busquedas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "guardar en el cache de busquedas" ON musica_busquedas;
CREATE POLICY "guardar en el cache de busquedas"
  ON musica_busquedas FOR INSERT TO authenticated
  WITH CHECK (true);

-- Los GRANT van SIEMPRE junto con las policies. RLS decide que filas se ven; el
-- GRANT decide si la tabla se puede tocar. Sin el, la policy mas permisiva del
-- mundo devuelve 42501 igual -- ya paso tres veces en este repo.
GRANT SELECT, INSERT, UPDATE ON sala_musica TO authenticated;
GRANT SELECT, INSERT ON musica_busquedas TO authenticated;
GRANT ALL ON sala_musica TO service_role;
GRANT ALL ON musica_busquedas TO service_role;

-- == 4 - En vivo =============================================================
-- Sin esto el canal responde SUBSCRIBED y no llega jamas un evento: uno pone una
-- cancion y a los demas no les suena nada, que es exactamente el fallo silencioso
-- que documenta la 023.
--
-- Va dentro de un DO con IF NOT EXISTS porque agregar una tabla ya publicada
-- aborta el ALTER con 42710 y revierte la migracion entera.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'sala_musica'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sala_musica;
  END IF;
END $pub$;

-- FULL y no DEFAULT: el cliente filtra por `conversacion_id`, que aca es la PK,
-- pero ademas necesita la fila vieja para no saltar el reproductor cuando el
-- UPDATE no toco ni la pista ni el reloj (por ejemplo, un cambio de modo_loop).
ALTER TABLE sala_musica REPLICA IDENTITY FULL;

-- El cache no se publica a proposito: nadie mira una tabla de cache en vivo, y
-- publicarla seria mandar un JSON de diez resultados por cada busqueda a todos
-- los navegadores conectados.

COMMENT ON TABLE sala_musica IS
  'Que suena en cada hilo y desde cuando. No transporta audio: cada navegador reproduce la misma pista en la misma posicion calculando (ahora - empezo_at) + offset_seg.';

COMMENT ON TABLE musica_busquedas IS
  'Cache de busquedas de YouTube. search.list cuesta 100 de las 10.000 unidades diarias; sin este cache la funcion se queda sin cuota el primer viernes.';
