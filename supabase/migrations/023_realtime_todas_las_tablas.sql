-- La app no se actualizaba sola: había que recargar para ver tareas nuevas,
-- leads movidos, reuniones y mensajes.
--
-- La causa, sondeada tabla por tabla contra la base (INSERT real, escuchando el
-- canal):
--
--   mensajes    → Realtime SÍ
--   tareas      → Realtime NO
--   fact_leads  → Realtime NO
--
-- El código YA se suscribe a `tareas` y a `fact_leads` (tareas-kanban.tsx,
-- leads-pipeline.tsx). El canal responde SUBSCRIBED y todo parece sano, pero no
-- llega un solo evento: esas tablas nunca entraron a la publicación. La 019
-- publicó únicamente `mensajes`, que es lo que necesitaba el chat.
--
-- Es el peor tipo de falla: silenciosa. Suscribirse a una tabla no publicada no
-- da error, simplemente no pasa nada nunca.

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Sin la publicación no hay nada que hacer, y no es motivo para abortar toda
  -- la migración: el CRM funciona igual, solo que sin tiempo real.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'No existe la publicación supabase_realtime: se omite el tiempo real.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'tareas',          -- el kanban ya escuchaba, sin recibir nada
    'fact_leads',      -- el pipeline igual
    'notificaciones',  -- la campana igual
    'reuniones',       -- el calendario, que ni siquiera escuchaba
    'dim_clientes',
    'dim_proyectos',
    'conversaciones',  -- para que la bandeja del chat se ordene sola
    'conversacion_miembros',
    'jornadas',        -- entrada y salida de turno, para la presencia real
    'cerebro_entradas' -- la bitácora se alimenta sola: que se vea al momento
  ]
  LOOP
    -- Se agrega una por una: si alguna ya estaba, no arrastra a las demás.
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;  -- ya publicada
      WHEN undefined_table  THEN NULL;  -- no existe en este proyecto
    END;
  END LOOP;
END $$;

-- Realtime respeta RLS, pero solo si la réplica lleva la fila completa: sin esto
-- un UPDATE llega sin las columnas viejas y el filtro del cliente no puede
-- decidir si el cambio le corresponde.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tareas','fact_leads','notificaciones','reuniones',
    'dim_clientes','dim_proyectos','conversaciones','conversacion_miembros',
    'jornadas','cerebro_entradas','mensajes'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;
