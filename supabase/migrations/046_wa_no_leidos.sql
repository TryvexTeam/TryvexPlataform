-- Mensajes de WhatsApp sin leer, por lead.
--
-- Por que existe: el chat del lead solo consulta el hilo MIENTRAS esta abierto
-- (y corta el sondeo al cerrarlo, para no gastar). Con el chat cerrado nadie
-- pregunta si contestaron, asi que un cliente podia responder y nadie enterarse
-- hasta volver a abrir esa ficha a mano. Lo reporto Cristian el 16-ago-2026
-- probando el chat con el numero de Tryvex ya vinculado: "al cerrar no me sale
-- si me llego un mensaje de esa persona".
--
-- El diseno mas barato que resuelve eso: guardar por lead HASTA CUANDO se leyo.
-- Lo no leido es entonces "entrantes posteriores a esa marca", que se cuenta con
-- una query y no obliga a tocar cada fila de mensajes_wa ni a inventar una tabla
-- de lecturas.
--
-- Limitacion asumida a proposito: la marca es del equipo entero, no por persona.
-- Si Vicente abre el chat, para Ignacio tambien queda leido. Para 3 personas
-- mirando el mismo buzon comercial eso es lo correcto (el mensaje ya fue visto
-- por alguien); si algun dia cada uno necesita su propio no-leido, esto se
-- reemplaza por una tabla lead_id + usuario_id + leido_hasta.
--
-- Idempotente: se puede correr dos veces.

-- 1. Hasta cuando se leyo cada conversacion ----------------------------------
ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS wa_leido_hasta timestamptz;

COMMENT ON COLUMN fact_leads.wa_leido_hasta IS
  'Momento hasta el cual el equipo leyo el hilo de WhatsApp de este lead. NULL = nunca se abrio. Los entrantes posteriores cuentan como no leidos.';

-- 2. Que contar los no leidos sea barato -------------------------------------
-- La lista de leads pregunta cada pocos segundos por TODOS los leads con
-- entrantes sin leer. Sin indice eso es un scan de mensajes_wa cada vez.
-- Parcial sobre los entrantes: los salientes nunca cuentan como no leidos, asi
-- que no tiene sentido indexarlos.
CREATE INDEX IF NOT EXISTS idx_mensajes_wa_entrantes_por_lead
  ON mensajes_wa (lead_id, created_at DESC)
  WHERE direccion = 'in';
