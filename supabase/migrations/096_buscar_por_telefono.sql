-- Índices para encontrar a alguien por su número de WhatsApp.
--
-- El problema, comprobado contra la base de producción: los teléfonos están
-- guardados con el formato que traía cada origen —`+56 9 8337 6557` de un
-- formulario, `56983376557` de WhatsApp, `8320044` de una planilla— y una
-- comparación de texto no los reconoce como el mismo número. Buscar
-- `ilike '%83376557'` sobre `+56 9 8337 6557` no devuelve nada, porque los
-- últimos ocho caracteres son `337 6557`, con espacio.
--
-- Un agente que atiende WhatsApp conoce el número, no el uuid de la ficha, así
-- que sin esto no puede registrar la conversación contra el lead correcto.
--
-- La solución es comparar solo dígitos contra dígitos. Estos índices son de
-- expresión: hacen que esa comparación use índice en vez de recorrer la tabla
-- entera, que con 558 leads todavía no duele pero con 50.000 sí.
--
-- No se normalizan los datos existentes a propósito: reescribir 555 teléfonos
-- es una migración destructiva que puede perder información de formato (una
-- extensión, una anotación), y el índice resuelve el problema sin tocarlos.

-- Los últimos 8 dígitos identifican a una persona sin ambigüedad práctica en
-- Chile. Menos casaría con demasiadas fichas; más obligaría a que el prefijo
-- de país esté escrito igual en los dos lados, que es justo lo que no pasa.
create index if not exists idx_fact_leads_telefono_digitos
  on public.fact_leads (right(regexp_replace(telefono, '\D', '', 'g'), 8))
  where telefono is not null and telefono <> '';

create index if not exists idx_dim_clientes_telefono_digitos
  on public.dim_clientes (right(regexp_replace(telefono, '\D', '', 'g'), 8))
  where telefono is not null and telefono <> '';

comment on index public.idx_fact_leads_telefono_digitos is
  'Busqueda por los ultimos 8 digitos del telefono, ignorando el formato. Lo usa /api/agentes/wa-mensaje para saber de quien es un mensaje de WhatsApp.';

comment on index public.idx_dim_clientes_telefono_digitos is
  'Busqueda por los ultimos 8 digitos del telefono, ignorando el formato.';

-- Búsqueda por teléfono, ignorando el formato.
--
-- Vive en la base y no en el código porque PostgREST no permite filtrar por una
-- expresión: `ilike '%83376557'` compararía contra el texto con espacios y no
-- encontraría nada. Una función es la forma de que la comparación ocurra donde
-- están los datos, usando el índice de arriba, sin traer la tabla a memoria.
--
-- `p_tabla` acepta solo dos valores fijos, comparados uno por uno: nunca se
-- interpola texto de quien llama dentro del SQL. Un nombre de tabla concatenado
-- es inyección, y esta función la ejecuta un agente que atiende WhatsApp.
create or replace function public.buscar_por_telefono(
  p_sufijo text,
  p_tabla text
)
returns table (id uuid, nombre text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Menos de 8 dígitos casaría con demasiadas fichas: se prefiere no devolver
  -- nada antes que devolver a la persona equivocada.
  if p_sufijo is null or length(p_sufijo) < 8 then
    return;
  end if;

  if p_tabla = 'fact_leads' then
    return query
      select l.id, l.nombre_negocio
      from public.fact_leads l
      where l.telefono is not null
        and right(regexp_replace(l.telefono, '\D', '', 'g'), 8) = p_sufijo
      limit 1;

  elsif p_tabla = 'dim_clientes' then
    return query
      select c.id, c.nombre
      from public.dim_clientes c
      where c.telefono is not null
        and right(regexp_replace(c.telefono, '\D', '', 'g'), 8) = p_sufijo
      limit 1;

  else
    raise exception 'Tabla no permitida: %', p_tabla;
  end if;
end;
$$;

-- Solo el rol de servicio. Esta función salta la RLS por ser SECURITY DEFINER,
-- así que un usuario autenticado no debe poder usarla para averiguar de quién
-- es un número que no le corresponde.
revoke all on function public.buscar_por_telefono(text, text) from public, anon, authenticated;
grant execute on function public.buscar_por_telefono(text, text) to service_role;

comment on function public.buscar_por_telefono is
  'Encuentra un lead o cliente por los ultimos 8 digitos de su telefono, ignorando el formato con que este guardado. Solo service_role.';
