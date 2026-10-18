-- Encontrar a quién pertenece un número sin adivinar, y sin dejar afuera a
-- quien tiene el teléfono guardado corto.
--
-- La 096 introdujo `buscar_por_telefono` para comparar dígitos contra dígitos
-- e ignorar el formato. Resolvió eso, pero arrastró dos problemas que se
-- comprobaron después contra la base de producción (556 leads con teléfono):
--
--   1. ADIVINABA. Terminaba en `limit 1`, así que cuando dos fichas comparten
--      los últimos 8 dígitos devolvía la primera que saliera, sin avisar que
--      había más de una. Hoy hay 7 sufijos compartidos (14 leads), y cuatro de
--      esos pares son NEGOCIOS DISTINTOS con el mismo número anotado:
--        · «Urgencia electricas 24 Hrs» / «Electricista, Certificado SEC»
--        · «Instituto Profesional Escuela de Contadores» / «CAMPUS ECAS»
--        · «Valera's Barber Shop» / «O-king barber»
--        · «Zona Franka» / «WhatsApp +56941301414»
--      Cuando uno de ellos escribe, su mensaje queda en la ficha del otro a
--      cara o cruz — y con Vex conversando, le contestaría con el contexto
--      del negocio equivocado.
--
--   2. DEJABA 75 LEADS INVISIBLES. Cortaba con `length(p_sufijo) < 8`, y hay
--      75 fichas (13%) cuyo teléfono guardado tiene solo 7 dígitos, sin código
--      de área (`8320218`, de una planilla). Un número de 7 dígitos no puede
--      terminar en una cadena de 8, así que jamás casaban: si escribían, se
--      les abría ficha nueva y quedaban duplicados.
--
--   3. LA BÚSQUEDA DE CLIENTES NUNCA FUNCIONÓ. La 096 seleccionaba
--      `c.nombre` de `dim_clientes`, y esa columna no existe: se llama
--      `nombre_negocio`. Cada consulta moría con «column c.nombre does not
--      exist», el código descartaba el error en silencio y seguía de largo a
--      los leads. Efecto real: a un cliente que escribía se le respondía con
--      su ficha vieja de lead, o se le trataba como desconocido. Salió a la
--      luz probando esta migración contra la base de verdad, no con tests.
--
-- Esta versión devuelve TODAS las coincidencias en vez de quedarse con una.
-- Quién decide qué hacer con dos candidatos no es la base: es el código que
-- llama, y ahí la regla es no elegir (ver lib/agentes/destinatario.ts).

drop function if exists public.buscar_por_telefono(text, text);

-- El índice de la 096 cubre la comparación por los últimos 8 dígitos. El
-- rescate de los teléfonos cortos necesita el suyo: recorre solo las fichas
-- con menos de 8 dígitos, que son pocas y no crecen (el scraper ya valida).
create index if not exists idx_fact_leads_telefono_corto
  on public.fact_leads (regexp_replace(telefono, '\D', '', 'g'))
  where telefono is not null
    and length(regexp_replace(telefono, '\D', '', 'g')) between 6 and 7;

create index if not exists idx_dim_clientes_telefono_corto
  on public.dim_clientes (regexp_replace(telefono, '\D', '', 'g'))
  where telefono is not null
    and length(regexp_replace(telefono, '\D', '', 'g')) between 6 and 7;

-- Busca por teléfono ignorando el formato, y devuelve todo lo que calce.
--
-- `p_tabla` acepta solo dos valores fijos, comparados uno por uno: nunca se
-- interpola texto de quien llama dentro del SQL. Un nombre de tabla
-- concatenado es inyección, y esta función la ejecuta un agente que atiende
-- WhatsApp.
--
-- El tope de 5 filas existe para que un dato basura (mil fichas con el mismo
-- número) no traiga la tabla entera a memoria. Con 2 ya alcanza para saber
-- que hay ambigüedad; las otras tres son para poder nombrar a los candidatos
-- en el aviso al humano.
create or replace function public.buscar_por_telefono(
  p_sufijo text,
  p_tabla text
)
returns table (id uuid, nombre text, telefono text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sufijo text := regexp_replace(coalesce(p_sufijo, ''), '\D', '', 'g');
begin
  -- Menos de 8 dígitos de entrada casaría con demasiadas fichas. Ojo que esto
  -- limita lo que ENTRA (un número de WhatsApp siempre trae 8 o más), no lo
  -- que está guardado: los teléfonos cortos de la base sí se buscan, abajo.
  if length(v_sufijo) < 8 then
    return;
  end if;

  if p_tabla = 'fact_leads' then
    return query
      select l.id, l.nombre_negocio, l.telefono
      from public.fact_leads l
      where l.telefono is not null
        and right(regexp_replace(l.telefono, '\D', '', 'g'), 8) = right(v_sufijo, 8)
      limit 5;

    -- Rescate de los teléfonos guardados sin código de área. Se intenta solo
    -- si la comparación buena no encontró nada: un calce de 8 dígitos siempre
    -- vale más que uno de 7, y mezclarlos volvería ambiguo lo que no lo es.
    if not found then
      return query
        select l.id, l.nombre_negocio, l.telefono
        from public.fact_leads l
        where l.telefono is not null
          and length(regexp_replace(l.telefono, '\D', '', 'g')) between 6 and 7
          and right(v_sufijo, length(regexp_replace(l.telefono, '\D', '', 'g')))
              = regexp_replace(l.telefono, '\D', '', 'g')
        limit 5;
    end if;

  elsif p_tabla = 'dim_clientes' then
    return query
      select c.id, c.nombre_negocio, c.telefono
      from public.dim_clientes c
      where c.telefono is not null
        and right(regexp_replace(c.telefono, '\D', '', 'g'), 8) = right(v_sufijo, 8)
      limit 5;

    if not found then
      return query
        select c.id, c.nombre_negocio, c.telefono
        from public.dim_clientes c
        where c.telefono is not null
          and length(regexp_replace(c.telefono, '\D', '', 'g')) between 6 and 7
          and right(v_sufijo, length(regexp_replace(c.telefono, '\D', '', 'g')))
              = regexp_replace(c.telefono, '\D', '', 'g')
        limit 5;
    end if;

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
  'Encuentra leads o clientes por telefono ignorando el formato, incluidos los guardados sin codigo de area. Devuelve TODAS las coincidencias (max 5): decidir entre dos candidatos no le toca a la base. Solo service_role.';

comment on index public.idx_fact_leads_telefono_corto is
  'Rescata las fichas con el telefono guardado sin codigo de area (6-7 digitos), invisibles para la busqueda por sufijo de 8.';
