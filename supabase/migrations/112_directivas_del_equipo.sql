-- Lo que el equipo decide y todos los agentes tienen que saber.
--
-- "Este mes hay 20 % de descuento en landings", "no ofrecer IA hasta octubre",
-- "los viernes no se agenda". Antes, un cambio así había que escribirlo en el
-- código de cada agente (el guion de Vex, el prompt del mensaje en frío), y
-- quedaba desalineado en el primero que se olvidaba. Ahora se escribe una vez,
-- en Intelligence, y cada agente lo lee al trabajar.
--
-- Tiene vigencia: una promoción del mes que nadie se acuerda de apagar sigue
-- ofreciéndose en noviembre. Con `vigente_hasta` se apaga sola.

create table if not exists directivas (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(btrim(texto)) between 5 and 500),

  -- A qué trabajo aplica:
  --   todos           → el primer mensaje y las conversaciones
  --   primer_mensaje  → solo el mensaje en frío que redacta el CRM
  --   conversacion    → solo lo que responde el agente de WhatsApp
  alcance text not null default 'todos'
    check (alcance in ('todos', 'primer_mensaje', 'conversacion')),

  vigente_desde date not null default current_date,
  vigente_hasta date,
  activa boolean not null default true,

  creado_por uuid references dim_integrantes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vigencia_en_orden check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table directivas is
  'Decisiones del equipo que todos los agentes deben tener en cuenta (promociones, cambios de oferta, reglas del momento). Se administran desde Intelligence.';

-- Lo único que se consulta de verdad: lo activo y vigente.
create index if not exists idx_directivas_activas
  on directivas (vigente_desde, vigente_hasta)
  where activa;

drop trigger if exists trg_directivas_updated_at on directivas;
create trigger trg_directivas_updated_at before update on directivas
  for each row execute function tocar_updated_at_encargos();

alter table directivas enable row level security;
drop policy if exists "integrantes acceso total" on directivas;
create policy "integrantes acceso total" on directivas
  for all using (is_integrante()) with check (is_integrante());

alter publication supabase_realtime add table directivas;
