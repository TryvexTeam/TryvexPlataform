-- Llamadas de voz y video dentro del CRM.
--
-- Decision de arquitectura: el audio y el video NO pasan por ningun servidor
-- nuestro. Van navegador a navegador (malla P2P sobre WebRTC). Por eso aca no hay
-- ninguna tabla de "sala", ni de streams, ni de minutos consumidos: no hay nada
-- que medir porque no hay nada que pagar. La llamada es ilimitada en duracion y
-- en cantidad por construccion, no por un plan contratado.
--
-- Lo que si necesita base de datos es lo que sobrevive a la llamada:
--   1. el timbre    -- avisarle a alguien que lo estan llamando, aunque tenga la
--                      pestana cerrada (de ahi la notificacion push)
--   2. el estado    -- que quien abre la app despues vea "hay una llamada en curso"
--   3. el historial -- que en el hilo quede "llamada de 12 min" o "perdida"
--
-- El intercambio de SDP y candidatos ICE viaja por Supabase Realtime broadcast,
-- que es efimero y no toca disco. Guardar una oferta SDP en una tabla seria
-- guardar basura: vence en segundos y no le sirve a nadie despues.

-- == 0 - Canales de voz ======================================================
-- Un canal de voz al estilo Discord es una sala que siempre esta ahi: uno entra,
-- ve quien esta dentro, y sale. No timbra, porque nadie te esta llamando.
--
-- Se modela como una conversacion mas, de tipo 'voz', en vez de una tabla propia.
-- Asi hereda gratis la membresia (`conversacion_miembros`), los permisos
-- (`es_miembro_conversacion`) y toda la maquinaria de llamadas de abajo. Una
-- tabla `canales_voz` aparte habria obligado a duplicar las policies y a que la
-- senalizacion supiera de dos mundos distintos.
ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS conversaciones_tipo_check;
ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_tipo_check
  CHECK (tipo IN ('dm', 'grupo', 'agentes', 'voz'));

-- La 019 exige `dm_key` para todo lo que no sea grupo -- se escribio cuando solo
-- habia dos tipos. Con 'agentes' ya habia quedado torcida y con 'voz' rompe: un
-- canal de voz no tiene par de personas del que sacar una clave.
-- Se reescribe para decir lo que siempre quiso decir: la clave la necesita el DM.
ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS dm_con_key;

-- Antes de exigirlo hay que dejarlo cierto. Las dos versiones anteriores del
-- constraint PERMITIAN que un grupo llevara `dm_key`, asi que puede haber filas
-- asi. Agregar el CHECK sin limpiar primero falla con 23514 y revierte la
-- migracion entera -- y como el SQL Editor corre todo en una transaccion, se
-- perderian tambien las tablas de llamadas de mas abajo.
UPDATE conversaciones SET dm_key = NULL WHERE tipo <> 'dm' AND dm_key IS NOT NULL;

ALTER TABLE conversaciones ADD CONSTRAINT dm_con_key
  CHECK ((tipo = 'dm' AND dm_key IS NOT NULL) OR (tipo <> 'dm' AND dm_key IS NULL));

-- Una sala inicial, para que la funcion exista el dia uno y no haya que crearla
-- antes de poder probarla. Entran todos los integrantes activos.
INSERT INTO conversaciones (tipo, nombre, creada_por)
SELECT 'voz', 'Sala del equipo', (SELECT id FROM dim_integrantes WHERE activo = true ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM conversaciones WHERE tipo = 'voz');

INSERT INTO conversacion_miembros (conversacion_id, integrante_id)
SELECT c.id, i.id
  FROM conversaciones c
  CROSS JOIN dim_integrantes i
 WHERE c.tipo = 'voz' AND i.activo = true
ON CONFLICT DO NOTHING;

-- == 1 - Llamadas ============================================================
CREATE TABLE IF NOT EXISTS llamadas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id  UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  iniciada_por     UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,

  -- sonando   = timbrando, nadie contesto todavia
  -- en_curso  = hay al menos dos personas dentro
  -- terminada = se acabo (por la razon que sea, ver motivo_fin)
  estado           TEXT NOT NULL DEFAULT 'sonando'
                   CHECK (estado IN ('sonando', 'en_curso', 'terminada')),

  -- Se puede empezar en audio y prender la camara despues; esto es solo con que
  -- se inicio, para que el que recibe sepa si le van a pedir la camara.
  con_video        BOOLEAN NOT NULL DEFAULT false,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contestada_at    TIMESTAMPTZ,
  terminada_at     TIMESTAMPTZ,

  -- colgada       = alguien corto normalmente
  -- sin_respuesta = timbro y nadie atendio
  -- rechazada     = la rechazaron explicitamente
  -- abandonada    = quedo colgada (el navegador se cerro sin avisar); la cierra
  --                 el barrido de zombis, no una persona
  motivo_fin       TEXT CHECK (motivo_fin IN ('colgada', 'sin_respuesta', 'rechazada', 'abandonada'))
);

-- Una sola llamada viva por conversacion.
--
-- Sin esto, el doble clic en el boton de llamar crea dos llamadas y el equipo
-- queda repartido en dos salas que no se ven entre si. Es un indice parcial
-- porque las terminadas se acumulan para siempre y esas si pueden repetirse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_llamada_viva_por_conversacion
  ON llamadas (conversacion_id)
  WHERE estado <> 'terminada';

CREATE INDEX IF NOT EXISTS idx_llamadas_conversacion
  ON llamadas (conversacion_id, created_at DESC);

-- == 2 - Quien esta en la llamada ============================================
-- Presence de Realtime ya dice quien esta conectado en este instante, y para
-- pintar los recuadros se usa eso, no esta tabla. Esta tabla guarda lo que
-- Presence olvida en cuanto alguien cierra la pestana: que a Vicente lo llamaron
-- y no contesto, que Cristian estuvo 20 minutos.
CREATE TABLE IF NOT EXISTS llamada_participantes (
  llamada_id     UUID NOT NULL REFERENCES llamadas(id) ON DELETE CASCADE,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,

  estado         TEXT NOT NULL DEFAULT 'invitado'
                 CHECK (estado IN ('invitado', 'en_llamada', 'rechazo', 'salio')),

  entro_at       TIMESTAMPTZ,
  salio_at       TIMESTAMPTZ,

  PRIMARY KEY (llamada_id, integrante_id)
);

CREATE INDEX IF NOT EXISTS idx_llamada_part_integrante
  ON llamada_participantes (integrante_id, estado);

-- == 3 - Permisos ============================================================
-- Una llamada se ve y se maneja si uno es miembro de la conversacion. El salto
-- de llamada a conversacion se hace aca dentro y no en el cliente: si dependiera
-- de lo que manda el front, cualquiera podria meterse en un DM ajeno. Mismo
-- criterio que las reacciones en la 032.
ALTER TABLE llamadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE llamada_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver llamadas de mis conversaciones" ON llamadas;
CREATE POLICY "ver llamadas de mis conversaciones"
  ON llamadas FOR SELECT TO authenticated
  USING (es_miembro_conversacion(conversacion_id));

DROP POLICY IF EXISTS "iniciar llamada en mis conversaciones" ON llamadas;
CREATE POLICY "iniciar llamada en mis conversaciones"
  ON llamadas FOR INSERT TO authenticated
  WITH CHECK (iniciada_por = mi_integrante_id() AND es_miembro_conversacion(conversacion_id));

-- Cualquier miembro puede terminarla, no solo quien la inicio: si el que llamo
-- se queda sin bateria, el resto tiene que poder cerrar la sala.
DROP POLICY IF EXISTS "actualizar llamadas de mis conversaciones" ON llamadas;
CREATE POLICY "actualizar llamadas de mis conversaciones"
  ON llamadas FOR UPDATE TO authenticated
  USING (es_miembro_conversacion(conversacion_id))
  WITH CHECK (es_miembro_conversacion(conversacion_id));

DROP POLICY IF EXISTS "ver participantes de mis llamadas" ON llamada_participantes;
CREATE POLICY "ver participantes de mis llamadas"
  ON llamada_participantes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM llamadas l
     WHERE l.id = llamada_id AND es_miembro_conversacion(l.conversacion_id)
  ));

DROP POLICY IF EXISTS "sumarme a una llamada" ON llamada_participantes;
CREATE POLICY "sumarme a una llamada"
  ON llamada_participantes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM llamadas l
     WHERE l.id = llamada_id AND es_miembro_conversacion(l.conversacion_id)
  ));

-- Solo se cambia el propio estado: marcar que otro "rechazo" seria contestar por el.
DROP POLICY IF EXISTS "cambiar mi estado en la llamada" ON llamada_participantes;
CREATE POLICY "cambiar mi estado en la llamada"
  ON llamada_participantes FOR UPDATE TO authenticated
  USING (integrante_id = mi_integrante_id())
  WITH CHECK (integrante_id = mi_integrante_id());

-- Los GRANT van SIEMPRE junto con las policies. RLS decide que filas se ven;
-- el GRANT decide si la tabla se puede tocar. Sin el, la policy mas permisiva
-- del mundo devuelve 42501 igual.
GRANT SELECT, INSERT, UPDATE ON llamadas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON llamada_participantes TO authenticated;
GRANT ALL ON llamadas TO service_role;
GRANT ALL ON llamada_participantes TO service_role;

-- == 4 - Barrido de zombis ===================================================
-- El caso real: alguien llama, le llega un llamado al celular y cierra el
-- notebook de un golpe. La llamada queda 'sonando' para siempre y el indice
-- unico de arriba bloquea todas las llamadas futuras de ese hilo.
--
-- No hay cron: se llama al crear una llamada nueva, que es exactamente cuando
-- importa. Un zombi que nadie mira no le hace mal a nadie.
CREATE OR REPLACE FUNCTION cerrar_llamadas_zombis(conv_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cerradas INTEGER;
BEGIN
  UPDATE llamadas
     SET estado = 'terminada',
         terminada_at = NOW(),
         motivo_fin = COALESCE(motivo_fin, 'abandonada')
   WHERE conversacion_id = conv_id
     AND estado <> 'terminada'
     AND (
       -- Timbro dos minutos y nadie contesto: no va a contestar.
       (estado = 'sonando' AND created_at < NOW() - INTERVAL '2 minutes')
       -- Doce horas "en curso" no es una llamada larga, es una pestana olvidada.
       OR (estado = 'en_curso' AND COALESCE(contestada_at, created_at) < NOW() - INTERVAL '12 hours')
     );

  GET DIAGNOSTICS cerradas = ROW_COUNT;
  RETURN cerradas;
END $fn$;

REVOKE ALL ON FUNCTION cerrar_llamadas_zombis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cerrar_llamadas_zombis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cerrar_llamadas_zombis(UUID) TO service_role;

-- == 5 - La notificacion de llamada entrante =================================
-- El CHECK de `notificaciones.tipo` es una lista cerrada, asi que hay que abrirla.
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN (
    'nuevo_cliente', 'proyecto_asignado', 'entrega_proxima',
    'cobro_proximo', 'tarea_asignada', 'cita_invitado',
    'llamada_entrante'
  ));

-- El indice de dedupe de la 011 es (integrante, tipo, titulo, dia). Sirve para el
-- cron diario, que manda el mismo aviso una vez al dia. Para llamadas es al reves:
-- si Cristian llama tres veces en la tarde, el titulo es identico las tres veces y
-- la segunda notificacion moria con un 23505 -- justo la que avisa que te estan
-- llamando de nuevo. Se rehace el indice excluyendo este tipo.
DROP INDEX IF EXISTS idx_notif_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedupe
  ON notificaciones (integrante_id, tipo, titulo, (((created_at AT TIME ZONE 'UTC')::date)))
  WHERE tipo <> 'llamada_entrante';

-- == 6 - En vivo =============================================================
-- Sin esto el canal responde SUBSCRIBED y no llega jamas un evento: la llamada
-- entrante nunca timbraria en la pantalla del otro. Documentado a fondo en la 023.
-- Va dentro de un DO por tabla porque agregar una ya publicada aborta el ALTER con
-- 42710 y revierte todas las demas -- ya paso con `notificaciones`.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'llamadas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE llamadas;
  END IF;
END $pub$;

DO $pub2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'llamada_participantes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE llamada_participantes;
  END IF;
END $pub2$;

ALTER TABLE llamadas REPLICA IDENTITY FULL;
ALTER TABLE llamada_participantes REPLICA IDENTITY FULL;

-- == 7 - Tres suscripciones que estaban mudas =================================
-- Hallazgo de auditoria: el cliente se suscribe a estas tres tablas y ninguna
-- estaba publicada. El canal responde SUBSCRIBED y no llega jamas un evento --
-- exactamente la falla silenciosa que documenta la 023. Lo tapaba el refresco
-- cada 45 segundos, asi que la pantalla se actualizaba tarde y nadie sospechaba.
--   fact_ventas     -> components/clientes/clientes-workspace.tsx
--   disponibilidad  -> components/equipo/equipo-tabs.tsx
--   dim_integrantes -> components/equipo/equipo-tabs.tsx
DO $pub3$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND tablename = 'fact_ventas') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fact_ventas;
  END IF;
END $pub3$;

DO $pub4$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND tablename = 'disponibilidad') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE disponibilidad;
  END IF;
END $pub4$;

DO $pub5$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND tablename = 'dim_integrantes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dim_integrantes;
  END IF;
END $pub5$;

-- FULL manda la fila vieja entera en cada UPDATE. `dim_integrantes` lleva
-- `horario` y `notificaciones` en JSONB, asi que se queda en DEFAULT: tiene PK y
-- ningun cliente filtra por columna que no sea la clave.
ALTER TABLE fact_ventas REPLICA IDENTITY DEFAULT;
ALTER TABLE disponibilidad REPLICA IDENTITY DEFAULT;
ALTER TABLE dim_integrantes REPLICA IDENTITY DEFAULT;

COMMENT ON TABLE llamadas IS
  'Llamadas de voz/video. El media va P2P entre navegadores y no toca el servidor: aca solo vive el timbre, el estado y el historial.';
