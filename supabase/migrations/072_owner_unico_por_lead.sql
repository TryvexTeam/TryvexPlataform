-- autoAsignarPorContacto (lib/repos/asignaciones.ts) decidia el rol con un
-- SELECT count() seguido de un INSERT separado: dos integrantes contactando
-- el mismo lead casi a la vez podian ver ambos count=0 y quedar ambos
-- rol='owner'. La PK compuesta (lead_id, integrante_id) no lo evita porque
-- son integrante_id distintos. Mismo patron que la migracion 071
-- (eventos_titulo_inicio_unico): mover la garantia de "solo un ganador" a un
-- constraint que Postgres haga cumplir, no a un SELECT previo.
CREATE UNIQUE INDEX IF NOT EXISTS lead_asignaciones_un_owner_por_lead
  ON lead_asignaciones (lead_id)
  WHERE rol = 'owner';
