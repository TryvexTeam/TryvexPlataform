-- La conversación con un lead que pasó FUERA del CRM, registrada a mano.
--
-- Cuando el equipo le escribe a un lead desde su propio WhatsApp (el botón
-- "WhatsApp" del lead abre la app o WhatsApp Web), esa conversación no pasa
-- por el número del equipo ni por Vex, y se perdía. Acá se va anotando.
--
-- Tabla APARTE de `mensajes_wa` a propósito: `mensajes_wa` es lo que escribe
-- el puente y lo que Vex lee como historial. Mezclar lo anotado a mano ahí
-- haría que Vex "recuerde" cosas que nunca dijo, y que un error de tipeo
-- termine en su contexto. Esta tabla nadie la lee salvo la ficha del lead.

create table if not exists lead_historial_manual (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references fact_leads(id) on delete cascade,
  -- 'in' = lo escribió el lead · 'out' = lo escribimos nosotros
  direccion text not null check (direccion in ('in', 'out')),
  texto text not null check (char_length(btrim(texto)) between 1 and 4000),
  -- Cuándo pasó de verdad (no cuándo se anotó): se puede registrar tarde.
  ocurrido_at timestamptz not null default now(),
  -- Por dónde fue, para leerlo después sin adivinar.
  canal text not null default 'whatsapp' check (canal in ('whatsapp', 'llamada', 'otro')),
  registrado_por uuid references dim_integrantes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_historial_manual_lead
  on lead_historial_manual (lead_id, ocurrido_at);

alter table lead_historial_manual enable row level security;

drop policy if exists "integrantes ven el historial manual" on lead_historial_manual;
create policy "integrantes ven el historial manual" on lead_historial_manual
  for select using (is_integrante());

drop policy if exists "integrantes anotan en el historial manual" on lead_historial_manual;
create policy "integrantes anotan en el historial manual" on lead_historial_manual
  for insert with check (is_integrante());

drop policy if exists "integrantes corrigen el historial manual" on lead_historial_manual;
create policy "integrantes corrigen el historial manual" on lead_historial_manual
  for delete using (is_integrante());

comment on table lead_historial_manual is
  'Conversación con el lead anotada a mano (fuera del número del equipo). Vex NO la lee.';
