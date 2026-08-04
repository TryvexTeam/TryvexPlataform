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
-- El código YA se suscribía a `tareas` y a `fact_leads` (tareas-kanban.tsx,
-- leads-pipeline.tsx). El canal respondía SUBSCRIBED y todo parecía sano, pero no
-- llegaba un solo evento: esas tablas nunca entraron a la publicación. La 019
-- publicó únicamente `mensajes`, que es lo que necesitaba el chat.
--
-- Es el peor tipo de falla: silenciosa. Suscribirse a una tabla no publicada no
-- da error, simplemente no pasa nada nunca.
--
-- Escrito sin format()/%I ni bloques DO: el SQL Editor de Supabase mutiló ambas
-- formas (42601) y, como corre todo en una transacción, un solo error revertía
-- el script entero.
--
-- `mensajes` y `notificaciones` NO van en la lista: ya estaban publicadas.
-- Incluirlas hacía fallar el ALTER completo con 42710 y, por la transacción, no
-- se agregaba ninguna de las otras once. Confirmado leyendo la publicación:
--
--   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   -> mensajes, notificaciones

ALTER PUBLICATION supabase_realtime ADD TABLE tareas, tarea_responsables, fact_leads, reuniones, dim_clientes, dim_proyectos, conversaciones, conversacion_miembros, jornadas, cerebro_entradas, interacciones_lead;

-- Realtime respeta RLS, pero solo si la réplica lleva la fila entera: sin esto un
-- UPDATE llega sin las columnas viejas y el filtro no puede decidir si el cambio
-- le corresponde a quien escucha.
ALTER TABLE tareas REPLICA IDENTITY FULL;
ALTER TABLE tarea_responsables REPLICA IDENTITY FULL;
ALTER TABLE fact_leads REPLICA IDENTITY FULL;
ALTER TABLE notificaciones REPLICA IDENTITY FULL;
ALTER TABLE reuniones REPLICA IDENTITY FULL;
ALTER TABLE dim_clientes REPLICA IDENTITY FULL;
ALTER TABLE dim_proyectos REPLICA IDENTITY FULL;
ALTER TABLE conversaciones REPLICA IDENTITY FULL;
ALTER TABLE conversacion_miembros REPLICA IDENTITY FULL;
ALTER TABLE jornadas REPLICA IDENTITY FULL;
ALTER TABLE cerebro_entradas REPLICA IDENTITY FULL;
ALTER TABLE interacciones_lead REPLICA IDENTITY FULL;
ALTER TABLE mensajes REPLICA IDENTITY FULL;
