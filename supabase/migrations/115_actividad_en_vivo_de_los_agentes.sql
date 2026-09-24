-- La actividad en vivo de cada agente: qué herramienta usa ahora y desde cuándo
-- está en su turno. La alimenta el hook de Claude Code (scripts/hook-oficina.mjs)
-- y la muestra el panel holográfico de la oficina de Intelligence.
--
-- Va en su propia tabla, y no en `agentes`, por una razón de peso: el hook
-- avisa en cada herramienta, varias veces por minuto. `agentes` hace recargar
-- Intelligence entera en cada cambio; esta tabla la escucha solo la oficina,
-- que actualiza el panel del agente sin recargar nada.
--
-- Nunca guarda el texto de lo que se le pidió al agente ni comandos completos:
-- solo el nombre de la herramienta y una etiqueta corta (ver el hook).

create table if not exists agente_actividad (
  agente_id uuid primary key references agentes(id) on delete cascade,
  herramienta text check (herramienta is null or char_length(herramienta) <= 160),
  herramienta_at timestamptz,
  turno_desde timestamptz,
  herramientas_turno integer not null default 0 check (herramientas_turno >= 0),
  updated_at timestamptz not null default now()
);

comment on table agente_actividad is
  'Qué hace cada agente en este momento (herramienta y turno). La escribe el hook de Claude Code; la lee la oficina 3D.';

alter table agente_actividad enable row level security;
drop policy if exists "integrantes leen" on agente_actividad;
create policy "integrantes leen" on agente_actividad
  for select using (is_integrante());

alter publication supabase_realtime add table agente_actividad;
