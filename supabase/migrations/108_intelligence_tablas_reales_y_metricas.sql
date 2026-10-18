-- Lo que le faltaba a Tryvex Intelligence para dejar de ser maqueta.
--
-- Solo se crea lo que NO existe en ninguna parte. Conversaciones, traspasos,
-- métricas e insights se DERIVAN de datos que ya existen (`mensajes_wa`, el
-- agente del VPS); duplicarlos en tablas nuevas crearía dos verdades que se
-- desalinean. Lo de acá abajo son cosas que hoy no registra nadie.
--
-- Todas siguen el criterio del resto del CRM: RLS con is_integrante(). Los
-- agentes escriben por /api/agentes/* con su token y service role, igual que
-- ya hacen con los mensajes.

-- ─── Costos ──────────────────────────────────────────────────────────────
-- Lo que gasta cada agente del equipo. El de WhatsApp ya lo registra el VPS en
-- su tabla `usage`; esto es para los demás (Jarvis, Ariel, Goku…), que hoy
-- consumen modelos sin que nadie lo anote.
create table if not exists agente_consumo (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  -- Para poder decir "este encargo costó tanto", no solo "este mes costó tanto".
  encargo_id uuid references agente_encargos(id) on delete set null,
  modelo text not null,
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  costo_usd numeric(12, 6) not null default 0 check (costo_usd >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_consumo_agente_fecha on agente_consumo (agente_id, created_at desc);

-- ─── Conocimiento ────────────────────────────────────────────────────────
-- Los documentos ya tienen casa: `cerebro_docs`. Lo que no existía es saber
-- CUÁLES usa cada agente. Un documento que nadie cita en 30 días es peso
-- muerto: o está mal indexado o nadie pregunta por eso.
create table if not exists agente_citas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  documento_id uuid not null references cerebro_docs(id) on delete cascade,
  encargo_id uuid references agente_encargos(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_citas_documento_fecha on agente_citas (documento_id, created_at desc);

-- ─── Rutinas ─────────────────────────────────────────────────────────────
-- Trabajo que corre sin que nadie lo pida: por reloj o por evento. Cada agente
-- declara las suyas y reporta cómo le fue en la última corrida. Una rutina que
-- dejó de correr es un fallo silencioso: por eso `ultima_at` es obligatorio de
-- reportar y la pantalla avisa cuando se atrasa.
create table if not exists agente_rutinas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  nombre text not null,
  -- En palabras de persona: "todos los días a las 09:00", "cuando entra un lead".
  disparador text not null,
  activa boolean not null default true,
  ultima_at timestamptz,
  ultimo_resultado text check (ultimo_resultado in ('ok', 'falla')),
  ultimo_detalle text,
  proxima_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (agente_id, nombre)
);

-- ─── Campañas ────────────────────────────────────────────────────────────
-- Salir a buscar, en vez de esperar. La regla no vive solo en la pantalla: la
-- base impide marcar como enviada una campaña que sale por un número propio o
-- con una plantilla no aprobada. Por el número propio se atiende a quien
-- escribe; salir a buscar por ahí es exactamente como se pierde un número.
create table if not exists campanas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  publico text not null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'esperando_plantilla', 'lista', 'enviando', 'enviada', 'detenida')),
  canal text not null,
  canal_oficial boolean not null default false,
  plantilla_nombre text,
  plantilla_aprobada boolean not null default false,
  destinatarios integer not null default 0 check (destinatarios >= 0),
  con_consentimiento integer not null default 0 check (con_consentimiento >= 0),
  agente_id uuid references agentes(id) on delete set null,
  entregados integer check (entregados >= 0),
  respondieron integer check (respondieron >= 0),
  reuniones integer check (reuniones >= 0),
  programada_at timestamptz,
  enviada_at timestamptz,
  creado_por uuid references dim_integrantes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consentimiento_no_supera_lista check (con_consentimiento <= destinatarios),
  -- La regla de la casa, en la base: no sale por número propio ni sin plantilla.
  constraint solo_sale_por_api_oficial
    check (estado not in ('enviando', 'enviada') or (canal_oficial and plantilla_aprobada))
);

-- ─── Mejoras ─────────────────────────────────────────────────────────────
-- Cambios que propone un agente (o una persona) a partir de lo que falla. Igual
-- que la cola: aplicar exige que alguien lo apruebe antes, y queda la firma.
create table if not exists mejoras (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid references agentes(id) on delete set null,
  titulo text not null,
  detalle text,
  -- Por qué se propone: el dato que lo justifica. Una mejora sin evidencia es
  -- una opinión.
  evidencia text,
  estado text not null default 'propuesta'
    check (estado in ('propuesta', 'aprobada', 'aplicada', 'descartada')),
  aprobado_por uuid references dim_integrantes(id) on delete set null,
  aprobado_at timestamptz,
  aplicada_at timestamptz,
  motivo_descarte text,
  creado_por uuid references dim_integrantes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mejora_aprobada_necesita_firma
    check (estado in ('propuesta', 'descartada') or aprobado_por is not null)
);

-- ─── Seguridad: mismo criterio que el resto del CRM ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['agente_consumo','agente_citas','agente_rutinas','campanas','mejoras'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "integrantes acceso total" on %I', t);
    execute format('create policy "integrantes acceso total" on %I for all using (is_integrante()) with check (is_integrante())', t);
  end loop;
end $$;

-- `updated_at` al día sin depender de la aplicación.
drop trigger if exists trg_rutinas_updated_at on agente_rutinas;
create trigger trg_rutinas_updated_at before update on agente_rutinas
  for each row execute function tocar_updated_at_encargos();
drop trigger if exists trg_campanas_updated_at on campanas;
create trigger trg_campanas_updated_at before update on campanas
  for each row execute function tocar_updated_at_encargos();
drop trigger if exists trg_mejoras_updated_at on mejoras;
create trigger trg_mejoras_updated_at before update on mejoras
  for each row execute function tocar_updated_at_encargos();

-- ─── Tiempo real ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table agente_consumo;
alter publication supabase_realtime add table agente_citas;
alter publication supabase_realtime add table agente_rutinas;
alter publication supabase_realtime add table campanas;
alter publication supabase_realtime add table mejoras;

-- ─── Métricas ────────────────────────────────────────────────────────────
-- Se calculan en la base y no en la aplicación: bajar todos los mensajes para
-- contarlos en Node crece con el historial; esto devuelve un JSON chico siempre.
--
-- Definiciones, escritas para que nadie tenga que adivinarlas:
--  · conversación      = un lead con al menos un mensaje ese día
--  · resuelta sin humano = el bot respondió y ninguna persona escribió ese día
--  · traspaso          = una persona del equipo escribió en esa conversación
--  · primera respuesta = de un mensaje entrante al siguiente saliente (≤ 24 h);
--                        se usa la MEDIANA porque un caso de 20 horas no debe
--                        esconder que la mayoría se contesta en segundos
--
-- security invoker: respeta las mismas políticas que una consulta normal.
create or replace function intelligence_metricas(p_dias integer default 14)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with rango as (
    select generate_series(
      (current_date - (greatest(p_dias, 1) - 1))::date, current_date, interval '1 day'
    )::date as dia
  ),
  por_dia as (
    select
      (m.created_at at time zone 'America/Santiago')::date as dia,
      m.lead_id,
      bool_or(m.direccion = 'out' and m.es_bot) as hubo_bot,
      bool_or(m.direccion = 'out' and not m.es_bot) as hubo_humano
    from mensajes_wa m
    where m.created_at >= (current_date - (greatest(p_dias, 1) - 1))::timestamp at time zone 'America/Santiago'
    group by 1, 2
  ),
  serie as (
    select r.dia,
      count(p.lead_id) as conversaciones,
      count(p.lead_id) filter (where p.hubo_bot and not p.hubo_humano) as resueltas
    from rango r left join por_dia p on p.dia = r.dia
    group by r.dia order by r.dia
  ),
  respuestas as (
    select extract(epoch from (
      select min(s.created_at) from mensajes_wa s
      where s.lead_id = e.lead_id and s.direccion = 'out' and s.created_at > e.created_at
    ) - e.created_at) as segundos
    from mensajes_wa e
    where e.direccion = 'in'
      and e.created_at >= (current_date - (greatest(p_dias, 1) - 1))::timestamp at time zone 'America/Santiago'
  )
  select jsonb_build_object(
    'conversaciones', (select count(distinct lead_id) from por_dia),
    'resueltasSinHumano', (select count(*) from (
        select lead_id from por_dia group by lead_id
        having bool_or(hubo_bot) and not bool_or(hubo_humano)) x),
    'traspasos', (select count(distinct lead_id) from por_dia where hubo_humano),
    'segundosPrimeraRespuesta', (
        select round(percentile_cont(0.5) within group (order by segundos))::int
        from respuestas where segundos is not null and segundos between 0 and 86400),
    'serieConversaciones', (select jsonb_agg(conversaciones order by dia) from serie),
    'serieResueltas', (select jsonb_agg(resueltas order by dia) from serie),
    'porQuien', (select coalesce(jsonb_agg(jsonb_build_object('quien', enviado_por, 'veces', n) order by n desc), '[]'::jsonb)
        from (select enviado_por, count(*) n from mensajes_wa
              where direccion = 'out' and not es_bot and enviado_por is not null
                and created_at >= (current_date - (greatest(p_dias, 1) - 1))::timestamp at time zone 'America/Santiago'
              group by enviado_por) q)
  );
$$;

comment on function intelligence_metricas is
  'Métricas de Tryvex Intelligence derivadas de mensajes_wa. Ver definiciones en el cuerpo.';
