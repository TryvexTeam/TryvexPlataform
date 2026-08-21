-- Hallazgo de auditoría de seguridad (agosto 2026): los tokens de agente
-- (Jarvis, Ariel, Spike — ver 024_perfil_adjuntos_presencia_agentes.sql y
-- 031_ingesta_agentes.sql) no expiraban nunca. Un token filtrado seguía
-- siendo válido para siempre. Este fix agrega expiración; NO reduce el
-- alcance de service_role (queda documentado como pendiente en el PR) ni
-- agrega rate limiting (ver TODO en lib/agentes/token.ts).

ALTER TABLE agentes
  ADD COLUMN IF NOT EXISTS expira_at TIMESTAMPTZ;

COMMENT ON COLUMN agentes.expira_at IS
  'TTL del token vigente. NULL = sin expirar (solo agentes creados antes de esta migración; los nuevos siempre la traen). Ver lib/agentes/token.ts.';

-- Los agentes ya existentes reciben una ventana de 90 días para rotar su
-- token antes de quedar bloqueados, en vez de expirar de golpe al deployar.
UPDATE agentes
   SET expira_at = NOW() + INTERVAL '90 days'
 WHERE expira_at IS NULL;
