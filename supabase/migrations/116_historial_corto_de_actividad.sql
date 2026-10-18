-- Lo último que hizo cada agente, para la ficha de la oficina.
--
-- agente_actividad guardaba solo la herramienta del momento: al tocar a un
-- agente, la ficha no podía contar qué venía haciendo. Ahora guarda también
-- las últimas 8, más reciente primero ({ "h": "Bash · npm", "at": "..." }).
-- Solo las etiquetas cortas del hook: nunca comandos completos ni textos.

alter table agente_actividad
  add column if not exists recientes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recientes) = 'array' and jsonb_array_length(recientes) <= 8);

comment on column agente_actividad.recientes is
  'Las últimas 8 herramientas del agente, más reciente primero: [{h, at}]. Solo etiquetas cortas.';
