-- Datos de reunión desde Google Calendar (PRP-007 extensión):
-- link de Meet, ubicación, link al evento en Google y asistentes externos (emails)
alter table eventos
  add column if not exists meet_link text,
  add column if not exists ubicacion text,
  add column if not exists html_link text,
  add column if not exists asistentes_externos jsonb not null default '[]'::jsonb;
