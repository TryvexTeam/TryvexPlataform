-- Un tipo más: "te cerramos la jornada sola".
--
-- Podría haber reusado 'tareas_atrasadas' y ahorrarse esta migración, pero cada
-- tipo tiene su interruptor en las preferencias del integrante: quien apagara
-- los avisos de tareas se quedaría sin enterarse de que le cerraron una jornada
-- a las 12 horas, que es un dato de su sueldo. Son dos cosas distintas y tienen
-- que poder apagarse por separado.

alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'nuevo_cliente', 'proyecto_asignado', 'entrega_proxima',
    'cobro_proximo', 'tarea_asignada', 'cita_invitado',
    'llamada_entrante', 'tareas_atrasadas', 'jornada_cerrada'
  ));
