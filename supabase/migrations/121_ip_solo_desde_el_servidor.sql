-- Las IPs solo las escribe y consulta el servidor.
--
-- En 119, `registrar_ip(p_ip)` se concedía a `authenticated`: cualquier integrante
-- podía llamarla por PostgREST con la IP de un compañero, que luego aparecería como
-- suya (origen 'app') y sería bloqueable al desvincularlo. Y `ip_bloqueada` se
-- concedía a `anon`: cualquiera podía preguntar qué redes están bloqueadas.
-- Ahora el CRM llama a ambas con la clave de servicio y la IP sale de la cabecera
-- que pone Vercel, nunca de un parámetro que controle el cliente.

revoke execute on function registrar_ip(text) from authenticated;
revoke execute on function ip_bloqueada(text) from anon, authenticated;

-- Registro con el integrante explícito (lo resuelve el servidor desde la sesión).
-- Tope de 200 IPs por integrante: si se llena, se descarta la más vieja.
create or replace function registrar_ip_de(p_integrante_id uuid, p_ip text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_ip inet;
begin
  if p_integrante_id is null or p_ip is null or btrim(p_ip) = '' then
    return;
  end if;
  begin
    v_ip := host(btrim(p_ip)::inet)::inet;
  exception when others then
    return;
  end;
  insert into integrante_ips (integrante_id, ip)
  values (p_integrante_id, v_ip)
  on conflict (integrante_id, ip) do update
    set ultima_vez = now()
    where integrante_ips.ultima_vez < now() - interval '1 hour';
  delete from integrante_ips
   where integrante_id = p_integrante_id
     and ip in (
       select ip from integrante_ips
        where integrante_id = p_integrante_id
        order by ultima_vez desc
       offset 200
     );
end $fn$;

revoke all on function registrar_ip_de(uuid, text) from public, anon, authenticated;
grant execute on function registrar_ip_de(uuid, text) to service_role;
