-- Endurecimiento RLS/privilegios alrededor de la reserva de citas de la landing.
--
-- == Que resuelve ==========================================================
--
--   1. `reservas_landing` (091) nace con RLS y una policy de SELECT solo para
--      `authenticated`, pero el GRANT de tabla que trae el default del proyecto
--      deja a `anon` con SELECT sobre la tabla. La RLS lo tapa hoy, pero es una
--      capa de mas: `anon` no tiene ningun motivo para leer esta tabla ni
--      siquiera con RLS de por medio. Se le quita el privilegio.
--
--   2. Las funciones nuevas 090/091 se crearon sin `SET search_path`. Una
--      funcion SECURITY INVOKER es menos expuesta que una DEFINER, pero fijar
--      `search_path = ''` y calificar cada identificador con su esquema es la
--      linea base que ya siguen las migraciones mas recientes y lo que espera
--      el linter de Supabase (`function_search_path_mutable`).
--
-- No cambia ninguna logica: los cuerpos son identicos, solo calificados.

-- == 1 - anon no lee reservas_landing ======================================

REVOKE SELECT ON public.reservas_landing FROM anon;

-- Y que ninguna TABLA FUTURA creada por `postgres` en `public` le de SELECT a
-- `anon` por defecto. Esto es INTENCIONAL y afecta a tablas que todavia no
-- existen: hoy CERO tablas dependen de que `anon` lea directo (la landing
-- publica lee por la vista `public.v_equipo_publico`, no por tablas). Si en el
-- futuro una tabla necesita lectura anonima directa, se le hace GRANT explicito
-- en su propia migracion.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;

-- == 2 - reemplazar_disponibilidad(uuid, smallint[], smallint[], boolean[]) =
-- Cuerpo identico al de 090; search_path fijo y todo calificado con `public.`.

CREATE OR REPLACE FUNCTION public.reemplazar_disponibilidad(
  p_integrante_id UUID,
  p_dias          SMALLINT[],
  p_horas         SMALLINT[],
  p_publicas      BOOLEAN[]
) RETURNS VOID
  LANGUAGE plpgsql
  SET search_path = ''
AS $fn$
BEGIN
  IF array_length(p_dias, 1) IS DISTINCT FROM array_length(p_horas, 1) THEN
    RAISE EXCEPTION 'dias y horas deben tener el mismo largo';
  END IF;

  IF p_publicas IS NOT NULL
     AND array_length(p_publicas, 1) IS DISTINCT FROM array_length(p_dias, 1) THEN
    RAISE EXCEPTION 'publicas debe tener el mismo largo que dias';
  END IF;

  DELETE FROM public.disponibilidad WHERE integrante_id = p_integrante_id;

  IF p_dias IS NULL OR array_length(p_dias, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.disponibilidad (integrante_id, dia_semana, hora, publica)
  SELECT
    p_integrante_id,
    p_dias[i],
    p_horas[i],
    COALESCE(p_publicas[i], false)
  FROM generate_subscripts(p_dias, 1) AS i;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[], BOOLEAN[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[], BOOLEAN[]) TO authenticated;

-- == 3 - reemplazar_disponibilidad(uuid, smallint[], smallint[]) ===========
-- Cuerpo identico al de 090 (la version que conserva lo publicado). La llamada
-- recursiva ahora es calificada con el esquema porque el search_path esta vacio.

CREATE OR REPLACE FUNCTION public.reemplazar_disponibilidad(
  p_integrante_id UUID,
  p_dias          SMALLINT[],
  p_horas         SMALLINT[]
) RETURNS VOID
  LANGUAGE plpgsql
  SET search_path = ''
AS $fn$
DECLARE
  v_publicas BOOLEAN[];
BEGIN
  SELECT array_agg(
           EXISTS (
             SELECT 1 FROM public.disponibilidad d
              WHERE d.integrante_id = p_integrante_id
                AND d.dia_semana    = p_dias[i]
                AND d.hora          = p_horas[i]
                AND d.publica
           )
           ORDER BY i
         )
    INTO v_publicas
    FROM generate_subscripts(p_dias, 1) AS i;

  PERFORM public.reemplazar_disponibilidad(p_integrante_id, p_dias, p_horas, v_publicas);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reemplazar_disponibilidad(UUID, SMALLINT[], SMALLINT[]) TO authenticated;

-- == 4 - reservar_cita_publica(...) ========================================
--
-- OJO COORDINACION: este statement solo FIJA el search_path sobre la funcion
-- que ya existe (091), sin recrear el cuerpo. Se hace asi a proposito para no
-- chocar con otra migracion en paralelo que podria estar recreando el cuerpo de
-- `reservar_cita_publica`. Si esa otra migracion la recrea con CREATE OR
-- REPLACE SIN incluir `SET search_path = ''`, hay que volver a aplicar este
-- ALTER despues (un CREATE OR REPLACE sin la clausula la borra). Lo ideal es
-- que quien recree el cuerpo incorpore `SET search_path = ''` y califique los
-- identificadores, y entonces este ALTER queda como no-op inofensivo.

ALTER FUNCTION public.reservar_cita_publica(
  TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) SET search_path = '';

-- == 5 - Comprobacion ======================================================
--
-- (a) anon ya no puede leer la tabla:
--       SELECT has_table_privilege('anon', 'public.reservas_landing', 'SELECT');
--       -- debe dar false
--
-- (b) Las 3 funciones tienen el search_path fijo:
--       SELECT p.proname, p.proconfig
--         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname = 'public'
--          AND p.proname IN ('reemplazar_disponibilidad', 'reservar_cita_publica');
--       -- proconfig debe contener 'search_path=' en las 3 filas
--
-- (c) El guardado de la grilla sigue funcionando desde el CRM (mover una celda,
--     guardar, recargar) y una reserva de punta a punta desde la landing sigue
--     dejando lead + evento + asistente + fila en reservas_landing.
