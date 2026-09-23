-- La cola de trabajo entre el equipo y los agentes.
--
-- Hasta ahora Tryvex Intelligence mostraba datos inventados en el código. Esto
-- es lo que la hace real: una persona le encola una tarea o una duda a un
-- agente, y el agente responde acá mismo.
--
-- La regla que manda: un encargo NACE en 'encolado' y el agente NO puede
-- trabajarlo. Solo cuando una persona lo aprueba pasa a 'aprobado' y recién ahí
-- el agente puede tomarlo. Es el mismo principio que ya usamos para lo
-- irreversible: la autorización va ANTES de ejecutar, no después.
--
-- Sobre el espacio: al responder NO se borra la fila. Si se borrara se perdería
-- qué se pidió, quién lo autorizó y qué contestó — que es justamente lo que
-- sirve para revisar después. Se marca `archivado_at` y sale de la cola activa
-- por el índice parcial de más abajo. En pantalla desaparece igual.

create table if not exists agente_encargos (
  id uuid primary key default gen_random_uuid(),

  -- A quién se le encarga.
  agente_id uuid not null references agentes(id) on delete cascade,

  -- Una tarea para hacer, o una duda para responder. Son cosas distintas:
  -- una duda se contesta, una tarea se ejecuta.
  tipo text not null default 'tarea' check (tipo in ('tarea', 'duda')),

  titulo text not null,
  detalle text,

  -- El recorrido completo. 'encolado' es la sala de espera: el agente lo ve
  -- pero no puede tocarlo hasta que alguien lo apruebe.
  estado text not null default 'encolado'
    check (estado in ('encolado', 'aprobado', 'en_curso', 'respondido', 'rechazado')),

  prioridad text not null default 'media'
    check (prioridad in ('baja', 'media', 'alta')),

  -- Quién lo pidió.
  creado_por uuid references dim_integrantes(id) on delete set null,

  -- Quién dio el permiso para ejecutar, y cuándo. Sin esto, no se ejecuta.
  aprobado_por uuid references dim_integrantes(id) on delete set null,
  aprobado_at timestamptz,

  -- Lo que el agente contestó o hizo.
  respuesta text,
  respondido_at timestamptz,

  -- Por qué se rechazó, si se rechazó. Un rechazo mudo no se puede revisar.
  motivo_rechazo text,

  -- Fuera de la cola activa, pero sin perder el historial.
  archivado_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un encargo aprobado sin quién lo aprobó es un permiso sin firma: se
  -- prohíbe en la base y no solo en la pantalla, porque la pantalla se puede
  -- saltar llamando a la API.
  constraint aprobado_necesita_firma
    check (estado = 'encolado' or estado = 'rechazado' or aprobado_por is not null)
);

comment on table agente_encargos is
  'Cola de tareas y dudas que el equipo le encola a los agentes. Un encargo solo se puede ejecutar después de que una persona lo aprueba.';
comment on column agente_encargos.estado is
  'encolado = esperando permiso humano · aprobado = el agente ya puede tomarlo · en_curso = lo está haciendo · respondido = contestó · rechazado = no se hace';
comment on column agente_encargos.archivado_at is
  'Sale de la cola activa sin borrar el historial. Nunca se borran filas al responder.';

-- La consulta que corre en cada carga de pantalla: la cola activa de un agente.
-- Índice parcial porque lo archivado no se consulta casi nunca y no merece
-- ocupar espacio en el índice.
create index if not exists idx_encargos_cola_activa
  on agente_encargos (agente_id, estado, created_at desc)
  where archivado_at is null;

-- Para el tablero del equipo: qué está esperando permiso, de todos los agentes.
create index if not exists idx_encargos_esperando_permiso
  on agente_encargos (created_at desc)
  where archivado_at is null and estado = 'encolado';

-- `updated_at` al día sin depender de que la aplicación se acuerde.
create or replace function tocar_updated_at_encargos()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_encargos_updated_at on agente_encargos;
create trigger trg_encargos_updated_at
  before update on agente_encargos
  for each row execute function tocar_updated_at_encargos();

-- Mismo criterio que el resto del CRM: acceso para integrantes del equipo.
alter table agente_encargos enable row level security;

drop policy if exists "integrantes acceso total" on agente_encargos;
create policy "integrantes acceso total" on agente_encargos
  for all using (is_integrante()) with check (is_integrante());

-- Tiempo real: sin esto la pantalla solo se entera al recargar.
alter publication supabase_realtime add table agente_encargos;
alter publication supabase_realtime add table mensajes_wa;
alter publication supabase_realtime add table agentes;
