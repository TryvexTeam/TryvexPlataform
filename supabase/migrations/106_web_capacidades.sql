-- Que tiene la web del lead, no solo si tiene una.
--
-- == Por que ==============================================================
--
-- Saber `tiene_web = true` no alcanzo. El 15-sep, a Opticas Premium --que ya
-- tiene opticaspremium.com-- Vex le ofrecio "agenda de horas" y "cotizaciones
-- online", que su sitio YA hace. Para el dueno eso se lee igual que ofrecerle
-- una pagina teniendo una: dice "no miramos tu negocio".
--
-- Con estas columnas, el guion y el mensaje pueden dejar de ofrecer lo que el
-- negocio ya resolvio, y apuntar a lo que de verdad le falta.
--
-- == Que guarda ===========================================================
--
-- `web_capacidades` es el resultado de `scraper/revisar_web.py`:
--
--   {
--     "url": "https://opticaspremium.com",
--     "revisada": true,          -- false = no se pudo leer la pagina
--     "capacidades": ["reserva", "whatsapp"],
--     "paginas_leidas": 2,
--     "error": null
--   }
--
-- 🔴 `revisada: false` NO significa "no tiene nada": significa que no pudimos
-- mirar. Y una capacidad ausente tampoco prueba que no exista -- el revisor
-- solo lee el HTML que entrega el servidor, asi que un sitio hecho con
-- JavaScript puede tener agenda sin que se vea. Quien lea esta columna tiene
-- que tratar la ausencia como "no sabemos", nunca como un "no".
--
-- `web_revisada_at` permite volver a mirar lo viejo sin re-revisar todo.

ALTER TABLE public.fact_leads
  ADD COLUMN IF NOT EXISTS web_capacidades jsonb,
  ADD COLUMN IF NOT EXISTS web_revisada_at timestamptz;

-- Para "los que tienen web y nunca revisamos" y "los revisados hace mucho",
-- que son las dos preguntas que hace el proceso que las llena.
CREATE INDEX IF NOT EXISTS idx_fact_leads_web_revisada_at
  ON public.fact_leads (web_revisada_at);

COMMENT ON COLUMN public.fact_leads.web_capacidades IS
  'Que ofrece el sitio del lead (reserva, cotiza, carrito, whatsapp, formulario, chat), '
  'segun scraper/revisar_web.py. Una capacidad ausente es "no sabemos", no "no la tiene".';

COMMENT ON COLUMN public.fact_leads.web_revisada_at IS
  'Cuando se reviso el sitio por ultima vez. NULL = nunca.';
