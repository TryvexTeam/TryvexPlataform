-- El estado que el propio agente declara, para la oficina de Intelligence.
--
-- Hasta ahora el estado de un agente se adivinaba por su último latido: si usó
-- el token hace poco, "trabajando". Eso no distingue trabajar de consultar la
-- cola cada 15 segundos sin nada que hacer. Ahora el agente (o su puente) puede
-- decir en qué está, por la API o por el MCP.
--
-- Lo declarado VENCE (estado_hasta): si un agente dice "trabajando" y después
-- se cae, la oficina no puede mostrarlo trabajando para siempre. Pasado el
-- plazo, se vuelve a mirar el latido.

alter table agentes
  add column if not exists estado_declarado text
    check (estado_declarado in ('trabajando', 'descansando', 'ausente')),
  add column if not exists estado_nota text
    check (estado_nota is null or char_length(estado_nota) <= 120),
  add column if not exists estado_hasta timestamptz,
  add column if not exists estado_declarado_at timestamptz;

comment on column agentes.estado_declarado is
  'Lo que el agente dice que está haciendo. Vale hasta estado_hasta; después manda el latido.';
comment on column agentes.estado_nota is
  'En qué está, en pocas palabras ("revisando el proxy"). Máximo 120 caracteres.';
