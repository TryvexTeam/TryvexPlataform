-- Bienvenida a quien se une y desvinculación con bloqueo de IP.
--
-- Requiere 038_registro_accesos aplicada antes (registro_accesos,
-- revocar_sesiones_auth, contar_superadmins_activos).
--
-- Dos FKs de la misma tabla hacia dim_integrantes van SIEMPRE con nombre:
-- sin nombre, PostgREST no sabe cuál usar en un embed y responde 500
-- (ya tumbó el calendario una vez). Los repos embeben con `!<nombre_fk>`.

-- ── Estado del integrante ────────────────────────────────────────────────────

-- Cuándo se anunció su llegada al equipo. NULL = todavía no se anunció.
alter table dim_integrantes add column if not exists llegada_anunciada_at timestamptz;
-- Cuándo se le desvinculó. Distinto de `activo = false` (revocación reversible):
-- un desvinculado no se re-vincula solo al volver a registrarse.
alter table dim_integrantes add column if not exists desvinculado_at timestamptz;

-- Quien ya tiene cuenta hoy no se anuncia: el anuncio es para los que llegan
-- desde ahora. Los pre-creados sin cuenta quedan en NULL y se anuncian al entrar.
update dim_integrantes
   set llegada_anunciada_at = coalesce(created_at, now())
 where llegada_anunciada_at is null
   and auth_user_id is not null;

-- ── Bienvenidas ──────────────────────────────────────────────────────────────

create table if not exists bienvenidas (
  nuevo_id   uuid not null constraint bienvenidas_nuevo_fkey references dim_integrantes(id) on delete cascade,
  de_id      uuid not null constraint bienvenidas_de_fkey    references dim_integrantes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (nuevo_id, de_id),
  check (nuevo_id <> de_id)
);

create index if not exists idx_bienvenidas_nuevo on bienvenidas (nuevo_id, created_at);

alter table bienvenidas enable row level security;

drop policy if exists "equipo ve las bienvenidas" on bienvenidas;
create policy "equipo ve las bienvenidas" on bienvenidas
  for select to authenticated using (is_integrante());

drop policy if exists "cada uno da su propia bienvenida" on bienvenidas;
create policy "cada uno da su propia bienvenida" on bienvenidas
  for insert to authenticated with check (is_integrante() and de_id = mi_integrante_id());

grant select, insert on bienvenidas to authenticated;
grant all on bienvenidas to service_role;

-- ── IPs vistas por integrante ────────────────────────────────────────────────
-- auth.sessions solo guarda las sesiones vivas y se borra al revocar; esta
-- tabla es la memoria de qué IPs usó cada uno, para bloquear y para detectar
-- redes compartidas.

create table if not exists integrante_ips (
  integrante_id uuid not null references dim_integrantes(id) on delete cascade,
  ip            inet not null,
  primera_vez   timestamptz not null default now(),
  ultima_vez    timestamptz not null default now(),
  primary key (integrante_id, ip)
);

create index if not exists idx_integrante_ips_ip on integrante_ips (ip, ultima_vez desc);

alter table integrante_ips enable row level security;
-- Sin políticas para authenticated: solo se escribe por registrar_ip() y se lee
-- con la clave de servicio.
grant all on integrante_ips to service_role;

-- Registra la IP del integrante en sesión. Máximo una escritura por hora por
-- IP: corre en cada navegación y no debe convertirse en una escritura por clic.
create or replace function registrar_ip(p_ip text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid := mi_integrante_id();
  v_ip inet;
begin
  if v_id is null or p_ip is null or btrim(p_ip) = '' then
    return;
  end if;
  begin
    v_ip := btrim(p_ip)::inet;
  exception when others then
    return; -- IP malformada: no se registra, no se rompe la navegación
  end;
  insert into integrante_ips (integrante_id, ip)
  values (v_id, v_ip)
  on conflict (integrante_id, ip) do update
    set ultima_vez = now()
    where integrante_ips.ultima_vez < now() - interval '1 hour';
end $fn$;

revoke all on function registrar_ip(text) from public, anon;
grant execute on function registrar_ip(text) to authenticated, service_role;

-- ── IPs bloqueadas ───────────────────────────────────────────────────────────

create table if not exists ips_bloqueadas (
  ip            inet primary key,
  integrante_id uuid constraint ips_bloqueadas_integrante_fkey references dim_integrantes(id) on delete set null,
  bloqueado_por uuid constraint ips_bloqueadas_actor_fkey      references dim_integrantes(id) on delete set null,
  motivo        text,
  created_at    timestamptz not null default now()
);

alter table ips_bloqueadas enable row level security;

drop policy if exists "superadmin ve las ips bloqueadas" on ips_bloqueadas;
create policy "superadmin ve las ips bloqueadas" on ips_bloqueadas
  for select to authenticated using (soy_superadmin());

grant select on ips_bloqueadas to authenticated;
grant all on ips_bloqueadas to service_role;

-- La consulta el proxy en cada request, con o sin sesión. Solo responde sí/no.
create or replace function ip_bloqueada(p_ip text)
returns boolean
language plpgsql security definer set search_path = public stable as $fn$
begin
  if p_ip is null or btrim(p_ip) = '' then
    return false;
  end if;
  -- `>>=`: una fila IPv6 guardada como /64 cubre todas las direcciones de ese prefijo.
  return exists (select 1 from ips_bloqueadas where ip >>= btrim(p_ip)::inet);
exception when others then
  return false;
end $fn$;

revoke all on function ip_bloqueada(text) from public;
grant execute on function ip_bloqueada(text) to anon, authenticated, service_role;

-- IPs que usó un integrante. `origen` importa: 'app' es la IP real del cliente
-- (la registra el CRM desde x-forwarded-for); 'sesion' sale de auth.sessions y
-- puede ser la IP de un servidor que refrescó el token (Vercel, AWS), no la de
-- la persona. La UI propone bloquear solo las de origen 'app'.
create or replace function ips_de_integrante(p_integrante_id uuid, p_dias integer default 90)
returns table (ip inet, ultima_vez timestamptz, origen text)
language sql security definer set search_path = public, auth stable as $fn$
  with fuentes as (
    select i.ip, i.ultima_vez, 'app'::text as origen
      from integrante_ips i
     where i.integrante_id = p_integrante_id
       and i.ultima_vez > now() - make_interval(days => p_dias)
    union all
    select s.ip, coalesce(s.refreshed_at, s.updated_at, s.created_at), 'sesion'
      from auth.sessions s
      join dim_integrantes d on d.auth_user_id = s.user_id
     where d.id = p_integrante_id
       and s.ip is not null
  )
  select f.ip, max(f.ultima_vez), min(f.origen) -- 'app' < 'sesion': gana 'app'
    from fuentes f
   group by f.ip
   order by 2 desc
$fn$;

revoke all on function ips_de_integrante(uuid, integer) from public, anon, authenticated;
grant execute on function ips_de_integrante(uuid, integer) to service_role;

-- Bloquea en lote. IPv6 se guarda como su /64: un proveedor rota la dirección
-- dentro del prefijo y bloquear la dirección exacta no serviría de nada.
create or replace function bloquear_ips(p_ips inet[], p_integrante_id uuid, p_actor_id uuid, p_motivo text)
returns inet[]
language sql security definer set search_path = public as $fn$
  with normalizadas as (
    select distinct case when family(x) = 6 then set_masklen(network(set_masklen(x, 64)), 64) else host(x)::inet end as ip
      from unnest(p_ips) as x
  ), insertadas as (
    insert into ips_bloqueadas (ip, integrante_id, bloqueado_por, motivo)
    select ip, p_integrante_id, p_actor_id, p_motivo from normalizadas
    on conflict (ip) do nothing
    returning ip
  )
  select coalesce(array_agg(ip), '{}') from normalizadas
$fn$;

revoke all on function bloquear_ips(inet[], uuid, uuid, text) from public, anon, authenticated;
grant execute on function bloquear_ips(inet[], uuid, uuid, text) to service_role;

-- De esas IPs, cuáles usa también otro integrante ACTIVO (red compartida).
create or replace function ips_compartidas(p_ips inet[], p_excluir uuid, p_dias integer default 30)
returns table (ip inet, integrantes text[])
language sql security definer set search_path = public, auth stable as $fn$
  with uso as (
    select i.ip, i.integrante_id
      from integrante_ips i
     where i.ip = any (p_ips)
       and i.ultima_vez > now() - make_interval(days => p_dias)
    union
    select s.ip, d.id
      from auth.sessions s
      join dim_integrantes d on d.auth_user_id = s.user_id
     where s.ip = any (p_ips)
  )
  select u.ip, array_agg(distinct d.nombre order by d.nombre)
    from uso u
    join dim_integrantes d on d.id = u.integrante_id
   where d.activo = true
     and d.id <> p_excluir
   group by u.ip
$fn$;

revoke all on function ips_compartidas(inet[], uuid, integer) from public, anon, authenticated;
grant execute on function ips_compartidas(inet[], uuid, integer) to service_role;

-- ── Bitácora ─────────────────────────────────────────────────────────────────

alter table registro_accesos drop constraint if exists registro_accesos_accion_check;
alter table registro_accesos add constraint registro_accesos_accion_check
  check (accion in ('revocado', 'restaurado', 'desvinculado', 'reincorporable'));
alter table registro_accesos add column if not exists ips_bloqueadas inet[];

-- ── Alta por registro (email o Google) ───────────────────────────────────────
-- Cambios respecto de 007:
--   · un desvinculado NO se re-vincula ni se re-crea al volver a registrarse;
--   · la invitación tiene que estar APROBADA (antes bastaba con que existiera).

create or replace function handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from dim_integrantes
     where lower(email) = lower(new.email) and desvinculado_at is not null
  ) then
    return new;
  end if;

  update dim_integrantes
     set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;

  if not found and exists (
    select 1 from invitaciones
     where lower(email) = lower(new.email)
       and used_at is null
       and aprobado_at is not null
       and expires_at > now()
  ) then
    insert into dim_integrantes (auth_user_id, nombre, email, activo)
    values (new.id, initcap(split_part(new.email, '@', 1)), lower(new.email), true)
    on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  end if;

  return new;
end;
$$;

-- ── Tipo de notificación nuevo ───────────────────────────────────────────────

alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check check (tipo = any (array[
  'nuevo_cliente', 'proyecto_asignado', 'entrega_proxima', 'cobro_proximo', 'tarea_asignada',
  'cita_invitado', 'llamada_entrante', 'tareas_atrasadas', 'jornada_cerrada', 'bienvenida'
]::text[]));
