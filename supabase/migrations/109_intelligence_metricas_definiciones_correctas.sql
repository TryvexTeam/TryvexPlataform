-- Corrección de intelligence_metricas: la primera versión contaba mal.
--
-- Medida contra los datos del 22-sep: de 65 leads con mensajes en 14 días, 56
-- eran PROSPECCIÓN (el equipo escribió y el cliente nunca respondió) y en todos
-- escribió primero una persona. La versión anterior contaba cualquier mensaje
-- humano como "traspaso", y habría mostrado 65 traspasos cuando hubo cero.
--
-- Definiciones nuevas:
--  · conversación      = el CLIENTE escribió al menos una vez en el período.
--                        Lo que el equipo manda sin respuesta es prospección,
--                        y se cuenta aparte.
--  · atendida por bot  = el bot respondió después del primer mensaje del cliente
--  · resuelta sin humano = atendida por bot y ninguna persona escribió después
--                        del bot
--  · traspaso          = una persona escribió DESPUÉS de que el bot ya había
--                        respondido: tomó el control de algo que atendía el bot
--  · sin respuesta     = el último mensaje es del cliente y nadie le contestó.
--                        Es lo que pasó el 18-sep con el proxy caído.
create or replace function intelligence_metricas(p_dias integer default 14)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with desde as (
    select ((current_date - (greatest(p_dias, 1) - 1))::timestamp at time zone 'America/Santiago') as t
  ),
  m as (
    select * from mensajes_wa where created_at >= (select t from desde)
  ),
  por_lead as (
    select lead_id,
      min(created_at) filter (where direccion = 'in') as primer_in,
      max(created_at) filter (where direccion = 'in') as ultimo_in,
      min(created_at) filter (where direccion = 'out' and es_bot) as primer_bot,
      max(created_at) filter (where direccion = 'out') as ultimo_out,
      count(*) filter (where direccion = 'in') as n_in
    from m group by lead_id
  ),
  clasif as (
    select p.*,
      (p.primer_bot is not null and p.primer_bot > p.primer_in) as atendida_bot,
      exists (select 1 from m h where h.lead_id = p.lead_id and h.direccion = 'out'
              and not h.es_bot and p.primer_bot is not null and h.created_at > p.primer_bot) as traspaso,
      (p.ultimo_in is not null and (p.ultimo_out is null or p.ultimo_in > p.ultimo_out)) as sin_respuesta
    from por_lead p where p.n_in > 0
  ),
  rango as (
    select generate_series((select t from desde)::date, current_date, interval '1 day')::date as dia
  ),
  dia_lead as (
    select (m.created_at at time zone 'America/Santiago')::date as dia, m.lead_id,
      bool_or(m.direccion = 'in') as hubo_in,
      bool_or(m.direccion = 'out' and m.es_bot) as hubo_bot
    from m group by 1, 2
  ),
  serie as (
    select r.dia,
      count(d.lead_id) filter (where d.hubo_in) as conversaciones,
      count(d.lead_id) filter (where d.hubo_in and d.hubo_bot
        and not exists (select 1 from clasif c where c.lead_id = d.lead_id and c.traspaso)) as resueltas
    from rango r left join dia_lead d on d.dia = r.dia
    group by r.dia
  ),
  respuestas as (
    select extract(epoch from (
      select min(s.created_at) from mensajes_wa s
      where s.lead_id = e.lead_id and s.direccion = 'out' and s.created_at > e.created_at
    ) - e.created_at) as segundos
    from m e where e.direccion = 'in'
  )
  select jsonb_build_object(
    'conversaciones', (select count(*) from clasif),
    'atendidasPorBot', (select count(*) from clasif where atendida_bot),
    'resueltasSinHumano', (select count(*) from clasif where atendida_bot and not traspaso),
    'traspasos', (select count(*) from clasif where traspaso),
    'sinRespuesta', (select count(*) from clasif where sin_respuesta),
    'prospeccionSinRespuesta', (select count(*) from por_lead where n_in = 0),
    'segundosPrimeraRespuesta', (
        select round(percentile_cont(0.5) within group (order by segundos))::int
        from respuestas where segundos is not null and segundos between 0 and 86400),
    'serieConversaciones', (select jsonb_agg(conversaciones order by dia) from serie),
    'serieResueltas', (select jsonb_agg(resueltas order by dia) from serie)
  );
$$;
