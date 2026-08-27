-- Endurece `reservar_cita_publica` (091) contra entradas que el RPC aceptaba
-- sin chistar.
--
-- Tres agujeros, todos del mismo tipo: la landing valida en su repo, pero este
-- RPC no puede asumir que quien lo llama valido nada, y hasta ahora confiaba.
--
--   1. HORIZONTE. Se podia reservar para dentro de dos anios. Una cita a un ano
--      vista no es una cita, es basura en la agenda de alguien. Tope: 60 dias.
--   2. DURACION. `p_duracion_min` entraba como fuera: 1 minuto, 600 minutos.
--      La llamada de descubrimiento dura lo que dice DURACION_CITA_MIN
--      (lib/types/disponibilidad.ts = 20) y nada mas.
--   3. CONSENTIMIENTO. `consentimiento_version` podia llegar vacio o en blanco
--      y la fila se guardaba igual, dejando la "prueba del consentimiento" que
--      pide la Ley 21.719 sin contenido. Si no hay version, no hay reserva.
--
-- El resto del cuerpo es IDENTICO a 091. Solo se agregan los tres chequeos,
-- despues de la validacion del minuto.

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

  -- Endurecimiento 094: cotas que la landing valida pero este RPC no puede
  -- dar por hechas.
  IF p_inicio > NOW() + INTERVAL '60 days' THEN
    RAISE EXCEPTION 'demasiado_lejos' USING ERRCODE = '22023';
  END IF;

  IF p_duracion_min IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'duracion_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_consentimiento_version IS NULL OR length(trim(p_consentimiento_version)) = 0 THEN
    RAISE EXCEPTION 'consentimiento_faltante' USING ERRCODE = '22023';
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

-- Los GRANT/REVOKE se reponen: CREATE OR REPLACE conserva los privilegios de la
-- funcion existente, pero si esto corre en un entorno donde 091 aun no aplico,
-- la funcion nace con el grant a PUBLIC de Postgres. Reafirmarlo no cuesta nada.
-- Ver 088 y 089: hay que revocar de PUBLIC *y* de anon.
REVOKE EXECUTE ON FUNCTION reservar_cita_publica(TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION reservar_cita_publica(TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- == Comprobacion ==========================================================
--
-- (a) Una hora a 90 dias devuelve 'demasiado_lejos' y no deja lead ni evento.
-- (b) p_duracion_min = 30 devuelve 'duracion_invalida'.
-- (c) p_consentimiento_version = '' o '   ' devuelve 'consentimiento_faltante'.
-- (d) Una reserva normal (20 min, dentro de 60 dias, con version) sigue
--     creando las tres filas igual que con 091.
