-- Que Vex recuerde a quién ya propuso, para no ofrecer los mismos leads.
--
-- El problema, reportado por el equipo: «si le pides un mensaje y después le
-- pides otro sin repetirle todo el contexto, devuelve el mismo lead».
--
-- La causa: `recomendarLeads` ordena por score y corta los primeros N. Es
-- determinista, así que dos pedidos seguidos con los mismos filtros devuelven
-- exactamente los mismos negocios. Vex ya guarda la conversación y la usa para
-- entender la INTENCIÓN, pero no para elegir A QUIÉN le escribe.
--
-- Y no hay dónde mirarlo: un borrador solo llega a `outreach_messages` cuando
-- se ENVÍA. Uno propuesto y descartado no deja rastro en ninguna parte, así que
-- al siguiente pedido vuelve a ser el mejor candidato.
--
-- Acá se guarda: en el turno de Vex queda la lista de leads que propuso. Va en
-- `vex_conversaciones` y no en una tabla nueva porque es exactamente eso — parte
-- de lo que se dijo en esa conversación — y porque así se borra junto con ella
-- cuando se va el integrante (el ON DELETE CASCADE ya está puesto).
--
-- `uuid[]` y no una tabla de relación: es una lista corta (3 a 10 ids) que
-- siempre se lee entera junto con su turno, nunca se consulta por lead. Una
-- tabla aparte agregaría un join a cada mensaje para no ganar nada.

alter table public.vex_conversaciones
  add column if not exists leads_propuestos uuid[];

comment on column public.vex_conversaciones.leads_propuestos is
  'Ids de los leads que Vex propuso en este turno. Se usan para NO volver a ofrecerlos en los pedidos siguientes de la misma conversacion. NULL en los turnos del usuario y en los que no proponen a nadie.';
