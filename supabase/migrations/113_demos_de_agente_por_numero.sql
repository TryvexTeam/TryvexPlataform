-- Demos: Vex responde como el agente de UN negocio, a UN número.
--
-- Para vender un agente, lo mejor es que el dueño lo pruebe en su propio
-- teléfono. Desde Intelligence se arma el agente de un local (con los datos de
-- su ficha) y se activa para un número: cuando ese número escribe, Vex deja de
-- hablar como vendedor de Tryvex y responde como el asistente de ese negocio.
-- Todos los demás números siguen atendidos como siempre.
--
-- Tres frenos, en la base y no solo en la pantalla:
--  · vence_at: la demo se apaga sola. Una demo olvidada no queda gastando.
--  · limite_mensajes: tope de respuestas. Si del otro lado hay un bot o alguien
--    jugando, no se queman tokens sin fin.
--  · un solo número con UNA demo activa a la vez: si hubiera dos, no se sabría
--    qué personaje tiene que responder.

create table if not exists demos_agente (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references fact_leads(id) on delete set null,

  -- Solo dígitos, con código de país (56912345678): así lo identifica el bot.
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),

  nombre_negocio text not null check (char_length(btrim(nombre_negocio)) between 2 and 120),

  -- El guion del personaje: quién es, qué ofrece, cómo habla. Se arma con los
  -- datos del lead y el equipo lo puede corregir antes de activar.
  guion text not null check (char_length(btrim(guion)) between 50 and 8000),

  activa boolean not null default true,
  vence_at timestamptz not null,
  limite_mensajes integer not null default 40 check (limite_mensajes between 1 and 500),
  mensajes_usados integer not null default 0 check (mensajes_usados >= 0),

  creado_por uuid references dim_integrantes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint no_supera_el_limite check (mensajes_usados <= limite_mensajes),
  constraint vence_despues_de_crearse check (vence_at > created_at)
);

comment on table demos_agente is
  'Demos de agente por número: cuando ese número escribe, Vex responde como el asistente del negocio en vez de como vendedor de Tryvex.';

-- Un número, una demo activa. Parcial: las apagadas quedan como historial.
create unique index if not exists uq_demo_activa_por_telefono
  on demos_agente (telefono) where activa;

drop trigger if exists trg_demos_updated_at on demos_agente;
create trigger trg_demos_updated_at before update on demos_agente
  for each row execute function tocar_updated_at_encargos();

alter table demos_agente enable row level security;
drop policy if exists "integrantes acceso total" on demos_agente;
create policy "integrantes acceso total" on demos_agente
  for all using (is_integrante()) with check (is_integrante());

alter publication supabase_realtime add table demos_agente;

-- Gastar una respuesta de la demo, de forma atómica.
--
-- Leer el contador y después escribirlo dejaría pasar dos respuestas
-- simultáneas con el último cupo. Esto lo hace en una sola sentencia y devuelve
-- cuántas quedan, o -1 si la demo ya no puede responder (apagada, vencida o sin
-- cupo). La llama el bot antes de cada respuesta en modo demo.
create or replace function consumir_mensaje_demo(p_id uuid)
returns integer
language sql
volatile
security invoker
set search_path = public
as $$
  with gastado as (
    update demos_agente
       set mensajes_usados = mensajes_usados + 1
     where id = p_id
       and activa
       and vence_at > now()
       and mensajes_usados < limite_mensajes
    returning limite_mensajes - mensajes_usados as quedan
  )
  select coalesce((select quedan from gastado), -1);
$$;
