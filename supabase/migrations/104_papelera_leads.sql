-- Papelera de leads: borrar un lead dejo de ser definitivo y silencioso.
--
-- POR QUE: entre el 31-ago y el 10-sep desaparecieron 57 leads de la base y no
-- hubo forma de saber quien los borro ni cuando. La cartera paso de 556 a 507
-- y el unico rastro fue el hueco. Dos agujeros lo hicieron posible:
--
--   1. `DELETE /api/leads/[id]` borraba la fila de verdad, a un clic, desde dos
--      pantallas distintas (lead-detalle y lead-panel). Sin papelera y sin
--      confirmacion que dijera que era para siempre.
--   2. La tabla `actividad` existe desde el schema inicial —con 'lead' ya en su
--      CHECK de referencia_tipo— y estaba VACIA: nadie la escribia nunca.
--
-- Y lo que lo hace peor que perder una fila: `interacciones_lead`,
-- `outreach_messages`, `mensajes_wa`, `lead_asignaciones` y `vex_conversaciones`
-- cuelgan de fact_leads con ON DELETE CASCADE. Borrar un lead se llevaba TODO
-- su historial de conversacion. Si alguno de esos 57 habia contestado, esa
-- respuesta ya no existe en ninguna parte.
--
-- Mismo diseno que la papelera de tareas (050), a proposito: eliminado_at NULL
-- = lead activo. El DELETE de la fila sigue existiendo pero pasa a ser un paso
-- aparte y explicito, alcanzable solo desde la papelera.
--
-- Idempotente: se puede correr dos veces.

ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS eliminado_at timestamptz;

COMMENT ON COLUMN fact_leads.eliminado_at IS
  'Momento en que el lead se movio a la papelera. NULL = lead activo. La fila y todo lo que cuelga de ella (interacciones, mensajes de WhatsApp, outreach, asignaciones) se conservan intactos hasta un borrado explicito desde la papelera.';

-- El kanban de /leads filtra por eliminado_at IS NULL en cada carga; sin indice
-- eso escanea la tabla entera cada vez que alguien abre la pantalla.
CREATE INDEX IF NOT EXISTS idx_fact_leads_eliminado_at
  ON fact_leads (eliminado_at);
