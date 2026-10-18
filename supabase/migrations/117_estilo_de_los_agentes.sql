-- El estilo de cada agente en la oficina 3D (el traje pintado en el cuerpo).
--
-- Los integrantes lo eligen desde Intelligence. Pero `agentes` solo se puede
-- LEER desde la app, y así debe seguir: abrir la edición de la tabla dejaría
-- tocar el token o desactivar agentes. Por eso el cambio pasa por una función
-- que solo toca `estilo`, y solo si quien llama es integrante.

alter table agentes
  add column if not exists estilo jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(estilo) = 'object'
      and (not estilo ? 'traje' or estilo->>'traje' in ('liso', 'esmoquin', 'bata', 'poleron', 'overol'))
    );

comment on column agentes.estilo is
  'Cómo se ve el agente en la oficina: {"traje": "liso|esmoquin|bata|poleron|overol"}. Vacío = el de por defecto.';

create or replace function cambiar_estilo_agente(p_agente uuid, p_traje text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_integrante() then
    raise exception 'Solo los integrantes pueden cambiar el estilo de un agente';
  end if;
  update agentes
     set estilo = jsonb_set(estilo, '{traje}', to_jsonb(p_traje))
   where id = p_agente;
  if not found then
    raise exception 'No existe ese agente';
  end if;
end;
$$;

revoke all on function cambiar_estilo_agente(uuid, text) from public;
grant execute on function cambiar_estilo_agente(uuid, text) to authenticated;
