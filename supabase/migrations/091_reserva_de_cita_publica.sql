-- La reserva de cita desde la landing, en una sola transaccion.
--
-- == Que reemplaza ==========================================================
--
-- Hoy /api/contact de la landing hace, en este orden: crea el evento en Google,
-- manda dos correos, y recien al final dispara un fire-and-forget a un
-- dashboard en Railway. La cita nace fuera del CRM y entra por la puerta de
-- atras; si el ultimo paso falla, nadie se entera y el lead no existe.
--
-- Aca la cita nace DENTRO del CRM: lead + evento + asistente + registro de la
-- reserva, todo o nada. La landing pasa a hacer solo lo suyo (validar el
-- formulario y mandar los correos con lo que este RPC le devuelve).
--
-- == Por que una tabla aparte y no un estado en `eventos` ====================
--
-- `reservas_landing` no duplica al evento: guarda lo que el evento no puede.
--
--   1. El CANDADO. Dos visitantes que abren el formulario a la vez y eligen la
--      misma hora pasan los dos la comprobacion de "esta libre" y reservan los
--      dos. Chequear y despues insertar es una carrera, siempre. El EXCLUDE de
--      mas abajo la pierde uno de los dos, decidido por Postgres y no por el
--      orden en que llegaron. Ponerlo sobre `eventos` obligaria a excluir los
--      eventos internos, que SI pueden solaparse entre si a proposito.
--
--   2. La PRUEBA DEL CONSENTIMIENTO. Hoy vive unicamente en el cuerpo de un
--      correo. La Ley 21.719 pide consentimiento previo, expreso e inequivoco;
--      lo que hace verificable el "informado" es saber QUE texto tenia delante
--      la persona, y eso es la version. Un correo en una bandeja no es un
--      registro consultable.
--
--   3. El FRENO. El rate limit de la landing vive en memoria del proceso
--      (`golpesPorIp`), asi que cada instancia serverless lleva su propio
--      contador y basta con conseguir instancias nuevas. Contar filas de esta
--      tabla por IP es un freno de verdad, compartido por todas las instancias.
--
-- Ver tambien 030_recuperar_password_y_saldo.sql: `password_reset_intentos` usa
-- exactamente el mismo patron para el mismo problema.

-- == 1 - De donde viene el lead =============================================
-- `origen` era ('scraper','manual','referido'). Un lead que llega solo por el
-- formulario no es ninguno de los tres, y distinguirlo importa: son los unicos
-- que se contactaron ELLOS, asi que se atienden distinto y se miden aparte.

ALTER TABLE fact_leads DROP CONSTRAINT IF EXISTS fact_leads_origen_check;
ALTER TABLE fact_leads
  ADD CONSTRAINT fact_leads_origen_check
  CHECK (origen IN ('scraper', 'manual', 'referido', 'landing'));

-- == 2 - El registro de la reserva ==========================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS reservas_landing (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id      UUID NOT NULL REFERENCES eventos(id)          ON DELETE CASCADE,
  lead_id        UUID          REFERENCES fact_leads(id)       ON DELETE SET NULL,
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id)  ON DELETE CASCADE,

  inicio         TIMESTAMPTZ NOT NULL,
  fin            TIMESTAMPTZ NOT NULL,
  -- Columna generada y no un trigger: no hay forma de que quede desincronizada
  -- de inicio/fin, y es sobre esta que trabaja el EXCLUDE.
  periodo        TSTZRANGE GENERATED ALWAYS AS (tstzrange(inicio, fin, '[)')) STORED,

  -- Lo que escribio el visitante. Se guarda tal cual para poder devolverle la
  -- llamada aunque el lead se edite despues.
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL,
  telefono       TEXT NOT NULL,
  mensaje        TEXT,

  -- La prueba del consentimiento. `version` identifica el texto que la persona
  -- tenia delante (VERSION_CONSENTIMIENTO en la landing); hora, IP y agente los
  -- pone el servidor y no el navegador: un dato que prueba una autorizacion no
  -- puede venir del mismo lado que la declara.
  consentimiento_version TEXT NOT NULL,
  ip             TEXT,
  user_agent     TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reservas_landing_rango CHECK (fin > inicio),

  -- EL CANDADO. Sin esto, dos visitantes simultaneos reservan la misma hora con
  -- la misma persona y ambos reciben su correo de "llamada confirmada".
  CONSTRAINT reservas_landing_sin_solape
    EXCLUDE USING gist (integrante_id WITH =, periodo WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_reservas_landing_ip_fecha ON reservas_landing (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservas_landing_inicio   ON reservas_landing (inicio);

ALTER TABLE reservas_landing ENABLE ROW LEVEL SECURITY;

-- El equipo puede consultarlas desde el CRM; escribirlas es solo del RPC, que
-- corre con service_role. Sin policy de INSERT/UPDATE/DELETE a proposito.
DROP POLICY IF EXISTS "integrantes leen reservas" ON reservas_landing;
CREATE POLICY "integrantes leen reservas"
  ON reservas_landing FOR SELECT TO authenticated USING (is_integrante());

-- == 3 - La reserva, atomica ================================================
--
-- Una funcion PL/pgSQL es una transaccion implicita: si falla el INSERT del
-- asistente, se revierten tambien el evento y el lead. Mismo criterio que
-- crear_evento_con_asistentes (069) y set_proyecto_equipo (063).
--
-- Devuelve a quien le toco, para que la landing lo ponga en el correo. Esa es
-- la unica vez que el visitante se entera de con quien habla: el endpoint de
-- disponibilidad no lo dice, porque publicar identidad junto a los huecos
-- entrega la agenda del equipo a cualquiera que la muestree.

CREATE OR REPLACE FUNCTION reservar_cita_publica(
  p_inicio                 TIMESTAMPTZ,
  p_duracion_min           INTEGER,
  p_nombre                 TEXT,
  p_email                  TEXT,
  p_telefono               TEXT,
  p_mensaje                TEXT,
  p_consentimiento_version TEXT,
  p_ip                     TEXT,
  p_user_agent             TEXT
) RETURNS TABLE (
  evento_id          UUID,
  lead_id            UUID,
  integrante_id      UUID,
  integrante_nombre  TEXT
) LANGUAGE plpgsql AS $fn$
DECLARE
  v_fin         TIMESTAMPTZ := p_inicio + make_interval(mins => p_duracion_min);
  v_dia_semana  SMALLINT;
  v_hora        SMALLINT;
  v_minuto      SMALLINT;
  v_integrante  UUID;
  v_nombre      TEXT;
  v_lead        UUID;
  v_evento      UUID;
BEGIN
  -- La hora que importa es la de Santiago: la grilla se llena pensando en el
  -- reloj local, no en UTC. `ISODOW` da 1=lunes..7=domingo; la tabla
  -- `disponibilidad` usa 0=lunes..6=domingo (ver 004).
  v_dia_semana := EXTRACT(ISODOW FROM p_inicio AT TIME ZONE 'America/Santiago')::SMALLINT - 1;
  v_hora       := EXTRACT(HOUR   FROM p_inicio AT TIME ZONE 'America/Santiago')::SMALLINT;
  v_minuto     := EXTRACT(MINUTE FROM p_inicio AT TIME ZONE 'America/Santiago')::SMALLINT;

  -- Solo los comienzos que el endpoint de disponibilidad ofrece. Sin esto se
  -- puede reservar a las 17:07 pidiendolo a mano, y esa cita no aparece en
  -- ninguna grilla.
  IF v_minuto NOT IN (0, 30) THEN
    RAISE EXCEPTION 'hora_no_ofrecida' USING ERRCODE = '22023';
  END IF;

  IF p_inicio < NOW() + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'demasiado_pronto' USING ERRCODE = '22023';
  END IF;

  -- A quien le toca: entre los que ofrecen esa celda y estan libres, el que
  -- menos citas tiene por delante. Reparte la carga en vez de cargar siempre
  -- al primero por orden alfabetico.
  SELECT i.id, i.nombre
    INTO v_integrante, v_nombre
    FROM dim_integrantes i
    JOIN disponibilidad d ON d.integrante_id = i.id
   WHERE i.activo
     AND i.visible_en_landing
     AND i.recibe_citas
     AND d.publica
     AND d.dia_semana = v_dia_semana
     AND d.hora       = v_hora
     -- Sin evento que solape: los que tienen asistentes bloquean solo a esos,
     -- los que no tienen (los que entran por el sync de Google, sobre un
     -- calendario compartido) bloquean a todos.
     AND NOT EXISTS (
       SELECT 1
         FROM eventos e
         LEFT JOIN eventos_asistentes ea ON ea.evento_id = e.id
        WHERE e.inicio < v_fin
          AND e.fin    > p_inicio
        GROUP BY e.id
       HAVING count(ea.integrante_id) = 0
           OR bool_or(ea.integrante_id = i.id)
     )
   ORDER BY (
     SELECT count(*) FROM eventos_asistentes ea2
       JOIN eventos e2 ON e2.id = ea2.evento_id
      WHERE ea2.integrante_id = i.id AND e2.inicio > NOW()
   ) ASC, i.id ASC
   LIMIT 1;

  IF v_integrante IS NULL THEN
    RAISE EXCEPTION 'slot_no_disponible' USING ERRCODE = '23505';
  END IF;

  -- `sin_contactar` y no un estado propio: entra al pipeline como cualquier
  -- lead, en la primera columna del kanban. Lo que lo distingue es el origen.
  INSERT INTO fact_leads (nombre_negocio, nombre_contacto, email, telefono, notas, estado, origen)
  VALUES (p_nombre, p_nombre, p_email, p_telefono, p_mensaje, 'sin_contactar', 'landing')
  RETURNING id INTO v_lead;

  INSERT INTO eventos (titulo, tipo, inicio, fin, lead_id, creado_por, notas, origen)
  VALUES (
    'Llamada Tryvex — ' || p_nombre,
    'reunion_lead',
    p_inicio,
    v_fin,
    v_lead,
    v_integrante,
    p_mensaje,
    'crm'
  )
  RETURNING id INTO v_evento;

  INSERT INTO eventos_asistentes (evento_id, integrante_id)
  VALUES (v_evento, v_integrante);

  -- El EXCLUDE decide la carrera. Si dos reservas simultaneas llegaron hasta
  -- aca, esta linea falla para una de las dos con 23P01 y su transaccion
  -- entera se revierte -- incluidos el lead y el evento de arriba.
  INSERT INTO reservas_landing (
    evento_id, lead_id, integrante_id, inicio, fin,
    nombre, email, telefono, mensaje,
    consentimiento_version, ip, user_agent
  )
  VALUES (
    v_evento, v_lead, v_integrante, p_inicio, v_fin,
    p_nombre, p_email, p_telefono, p_mensaje,
    p_consentimiento_version, p_ip, p_user_agent
  );

  RETURN QUERY SELECT v_evento, v_lead, v_integrante, v_nombre;
END $fn$;

-- Solo el servidor. Ver 088 y 089: hay que revocar de PUBLIC *y* de anon --
-- el grant a anon lo pone el default del proyecto, el de PUBLIC lo pone
-- Postgres en toda funcion nueva, y revocar uno solo deja la puerta abierta.
REVOKE EXECUTE ON FUNCTION reservar_cita_publica(TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION reservar_cita_publica(TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- == 4 - Comprobacion =======================================================
--
-- (a) El candado existe y es de exclusion, no un indice unico cualquiera:
--       SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--        WHERE conrelid = 'reservas_landing'::regclass AND contype = 'x';
--
-- (b) El candado FUNCIONA -- esta es la que prueba algo. Dos reservas que se
--     solapan para la misma persona: la segunda debe fallar con 23P01.
--       INSERT INTO reservas_landing (...) VALUES (... 17:00-17:20 ...);
--       INSERT INTO reservas_landing (...) VALUES (... 17:10-17:30 ...); -- debe fallar
--
-- (c) La funcion no es llamable sin ser el servidor. Las tres deben dar false:
--       SELECT has_function_privilege('anon',          'public.reservar_cita_publica(timestamptz,integer,text,text,text,text,text,text,text)', 'EXECUTE'),
--              has_function_privilege('authenticated', 'public.reservar_cita_publica(timestamptz,integer,text,text,text,text,text,text,text)', 'EXECUTE');
--       -- y service_role debe dar true
--
-- (d) Una reserva de punta a punta deja las cuatro filas, o ninguna:
--       SELECT (SELECT count(*) FROM reservas_landing),
--              (SELECT count(*) FROM eventos WHERE tipo='reunion_lead'),
--              (SELECT count(*) FROM fact_leads WHERE origen='landing');
--
-- (e) Y que el rechazo sea limpio: pedir una hora sin nadie disponible tiene
--     que devolver 'slot_no_disponible' y NO dejar lead ni evento sueltos.
