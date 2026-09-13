-- La reserva de citas de la landing estaba ROTA. Este es el arreglo.
--
-- == Que pasaba ============================================================
--
-- Cualquier persona que entrara a tryvex.tech/contacto, eligiera dia y hora y
-- apretara "Acepto y agendo cita" recibia un 503 y NADA quedaba registrado:
-- ni lead, ni evento, ni fila en `reservas_landing` (0 filas historicas).
-- La pantalla ademas no mostraba ningun error, asi que el visitante se iba
-- creyendo que habia agendado.
--
-- Verificado el 13-sep-2026 llamando al RPC directo:
--
--     42P01: relation "dim_integrantes" does not exist
--
-- == Por que ===============================================================
--
-- Colision de dos migraciones, cada una correcta por separado:
--
--   * La 094 recreo el cuerpo con CREATE OR REPLACE usando los identificadores
--     SIN calificar (dim_integrantes, disponibilidad, eventos, fact_leads,
--     reservas_landing) y sin clausula SET search_path.
--
--   * La 095, endureciendo seguridad, aplico
--     ALTER FUNCTION ... SET search_path = '' SIN recrear el cuerpo -- a
--     proposito, para no chocar con otra migracion en paralelo.
--
-- Con search_path vacio ningun nombre sin esquema se resuelve. La funcion
-- quedo aceptando la llamada y reventando por dentro en la primera tabla que
-- tocaba. Falla en silencio: el RPC devuelve error, el endpoint lo traduce a
-- "booking failed" y ahi muere.
--
-- La propia 095 dejo escrita la comprobacion que lo habria atrapado -- "una
-- reserva de punta a punta desde la landing sigue dejando lead + evento +
-- asistente + fila en reservas_landing". Nunca se corrio.
--
-- == Que hace esta migracion ==============================================
--
-- Recrea la funcion con el cuerpo IDENTICO al de la 094 --misma logica, mismos
-- chequeos, mismos codigos de error-- pero con las dos cosas que tienen que ir
-- juntas y nunca fueron juntas:
--
--   1. SET search_path = '' en la propia definicion, para que no dependa de un
--      ALTER posterior que un CREATE OR REPLACE puede borrar.
--   2. TODOS los identificadores calificados con public.
--
-- Las funciones sin calificar que quedan (now, count, bool_or, length, trim,
-- make_interval, EXTRACT) son de pg_catalog, que siempre esta en el search_path
-- implicito.
--
-- Idempotente: se puede correr dos veces.

CREATE OR REPLACE FUNCTION public.reservar_cita_publica(
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
)
  LANGUAGE plpgsql
  SET search_path = ''
AS $fn$
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
  -- reloj local, no en UTC. ISODOW da 1=lunes..7=domingo; la tabla
  -- disponibilidad usa 0=lunes..6=domingo (ver 004).
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
    FROM public.dim_integrantes i
    JOIN public.disponibilidad d ON d.integrante_id = i.id
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
         FROM public.eventos e
         LEFT JOIN public.eventos_asistentes ea ON ea.evento_id = e.id
        WHERE e.inicio < v_fin
          AND e.fin    > p_inicio
        GROUP BY e.id
       HAVING count(ea.integrante_id) = 0
           OR bool_or(ea.integrante_id = i.id)
     )
   ORDER BY (
     SELECT count(*) FROM public.eventos_asistentes ea2
       JOIN public.eventos e2 ON e2.id = ea2.evento_id
      WHERE ea2.integrante_id = i.id AND e2.inicio > NOW()
   ) ASC, i.id ASC
   LIMIT 1;

  IF v_integrante IS NULL THEN
    RAISE EXCEPTION 'slot_no_disponible' USING ERRCODE = '23505';
  END IF;

  -- sin_contactar y no un estado propio: entra al pipeline como cualquier lead,
  -- en la primera columna del kanban. Lo que lo distingue es el origen.
  INSERT INTO public.fact_leads (nombre_negocio, nombre_contacto, email, telefono, notas, estado, origen)
  VALUES (p_nombre, p_nombre, p_email, p_telefono, p_mensaje, 'sin_contactar', 'landing')
  RETURNING id INTO v_lead;

  INSERT INTO public.eventos (titulo, tipo, inicio, fin, lead_id, creado_por, notas, origen)
  VALUES (
    'Llamada Tryvex - ' || p_nombre,
    'reunion_lead',
    p_inicio,
    v_fin,
    v_lead,
    v_integrante,
    p_mensaje,
    'crm'
  )
  RETURNING id INTO v_evento;

  INSERT INTO public.eventos_asistentes (evento_id, integrante_id)
  VALUES (v_evento, v_integrante);

  -- El EXCLUDE decide la carrera. Si dos reservas simultaneas llegaron hasta
  -- aca, esta linea falla para una de las dos con 23P01 y su transaccion entera
  -- se revierte -- incluidos el lead y el evento de arriba.
  INSERT INTO public.reservas_landing (
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

-- Los privilegios se reponen: CREATE OR REPLACE los conserva, pero reafirmarlos
-- no cuesta nada y deja la funcion correcta tambien en un entorno limpio.
-- Ver 088 y 089: hay que revocar de PUBLIC *y* de anon.
REVOKE EXECUTE ON FUNCTION public.reservar_cita_publica(TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reservar_cita_publica(TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- == Comprobacion (ESTA VEZ SI HAY QUE CORRERLA) ==========================
--
-- (a) El search_path quedo fijo EN LA DEFINICION, no por un ALTER suelto:
--       SELECT p.proname, p.proconfig
--         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname = 'public' AND p.proname = 'reservar_cita_publica';
--       -- proconfig debe contener 'search_path='
--
-- (b) Una reserva de punta a punta desde tryvex.tech/contacto deja las cuatro
--     filas: lead + evento + asistente + reservas_landing. Es la comprobacion
--     que la 095 pidio y que nadie corrio; es la unica que prueba el arreglo.
