-- Qué agente agendó una reunión.
--
-- No se reutiliza `origen`: esa columna dice DÓNDE se creó el evento (crm o
-- google) y la sincronización con Google depende de ella. Mezclarle "lo agendó
-- un agente" rompería ese flujo. Esto es otra pregunta y va en otra columna.
--
-- Sin esto, Métricas no puede contar reuniones agendadas por agentes: hoy el
-- evento se atribuye al integrante dueño del agente, y queda indistinguible de
-- uno agendado a mano.
alter table eventos
  add column if not exists agente_id uuid references agentes(id) on delete set null;

create index if not exists idx_eventos_agente on eventos (agente_id, created_at desc)
  where agente_id is not null;

comment on column eventos.agente_id is
  'El agente que agendó el evento por /api/agentes/eventos. Null = lo agendó una persona.';
