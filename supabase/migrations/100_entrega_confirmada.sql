-- Que «enviado» signifique enviado.
--
-- Hoy el CRM marca un mensaje como enviado cuando el AGENTE ACEPTA EL ENCARGO,
-- no cuando WhatsApp lo acepta. Son cosas distintas, y esta semana la diferencia
-- costó dos días: WhatsApp estuvo devolviendo el acuse de recibo con
-- `error: 463` —lo recibe y lo descarta— mientras el CRM mostraba todo enviado
-- y movía las fichas a «contactado». El 29-ago había 11 filas marcadas enviado,
-- las once con `enviado_at` y `wa_message_id` en NULL, ninguna entregada.
--
-- La evidencia del 463, capturada por Jarvis apenas se destapó el logger:
--   {"from":"569...@s.whatsapp.net","class":"message","error":"463","t":...}
--
-- El problema de fondo no es el 463: es que **un fallback optimista es una
-- mentira estructural**. Mientras «enviado» dependa de lo que nosotros
-- entregamos y no de lo que WhatsApp confirma, el equipo va a seguir trabajando
-- sobre fichas que dicen contactado sin estarlo.
--
-- Esta migración abre el estado intermedio que faltaba. No inventa entregas:
-- deja de afirmarlas hasta que llegue el acuse.

-- `pendiente`: salió de nuestras manos, WhatsApp todavía no acusó recibo. Es el
-- estado honesto entre «lo mandé» y «llegó», y hasta hoy no existía — por eso
-- había que elegir entre mentir o no decir nada.
alter table public.mensajes_wa drop constraint if exists mensajes_wa_estado_envio_check;

alter table public.mensajes_wa add constraint mensajes_wa_estado_envio_check
  check (estado_envio is null or estado_envio in
    ('pendiente', 'enviado', 'entregado', 'leido', 'fallido'));

-- Por qué el ACK va guardado y no solo interpretado: cuando el 463 apareció,
-- lo que resolvió el diagnóstico fue el acuse CRUDO, no nuestra lectura de él.
-- Un código de error que nadie guardó es un diagnóstico que hay que volver a
-- provocar.
alter table public.mensajes_wa
  add column if not exists ack_codigo text,
  add column if not exists ack_at     timestamptz;

comment on column public.mensajes_wa.ack_codigo is
  'Codigo del acuse de recibo de WhatsApp tal cual llego (ej: "463"). NULL mientras no haya acuse. Es la diferencia entre "lo entregamos al agente" y "WhatsApp lo acepto".';

comment on column public.mensajes_wa.ack_at is
  'Cuando llego el acuse. Si esta en NULL y el mensaje tiene horas, nadie confirmo nada: no asumir que llego.';

comment on column public.mensajes_wa.estado_envio is
  'pendiente = salio de nuestras manos, sin acuse todavia. entregado/leido = WhatsApp confirmo. fallido = acuse con error. NUNCA marcar entregado sin acuse: es la mentira que costo dos dias en agosto.';

-- El buzón ya tenía `wa_message_id` y `enviado_at`, y estaban SIEMPRE en NULL:
-- nadie los llenaba. Se dejan como están —son las columnas correctas— pero
-- ahora se documenta qué significan, porque `enviado_at IS NULL` sobre una fila
-- marcada 'enviado' es exactamente la señal de que nunca se confirmó nada.
comment on column public.outreach_messages.enviado_at is
  'Cuando WhatsApp ACUSO RECIBO, no cuando se encolo. Si es NULL sobre una fila enviado, ese mensaje nunca se confirmo.';

comment on column public.outreach_messages.wa_message_id is
  'Id con el que el transporte reconoce el mensaje. Es lo que permite emparejar el acuse posterior con esta fila.';

-- Buscar el mensaje al que corresponde un acuse tiene que ser barato: llega uno
-- por cada envío y el hilo se consulta entero en cada apertura del chat.
create index if not exists idx_mensajes_wa_message_id
  on public.mensajes_wa (wa_message_id)
  where wa_message_id is not null;
