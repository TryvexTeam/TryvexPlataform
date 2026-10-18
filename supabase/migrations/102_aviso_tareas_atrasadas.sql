-- Un tipo de notificación nuevo: "tienes tareas pasadas de fecha".
--
-- Sale de algo que dijo Cristian el 11-sep-2026: "mis compañeros de Tryvex no
-- hacen sus tareas —y me incluyo— como que no hay algo que nos obliga". Al
-- correr la cuenta ese día había 10 tareas atrasadas repartidas en 4 personas,
-- y ninguna generaba un solo aviso: había que entrar a Tareas y buscarlas.
--
-- `notificaciones.tipo` es una lista cerrada (011, ampliada en la 033), así que
-- hay que abrirla otra vez. Sin esto el insert falla con 23514 y el cron diario
-- se cae entero — incluidos los avisos de entregas y cobros, que hoy funcionan.

alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'nuevo_cliente', 'proyecto_asignado', 'entrega_proxima',
    'cobro_proximo', 'tarea_asignada', 'cita_invitado',
    'llamada_entrante', 'tareas_atrasadas'
  ));

-- El índice de dedupe de la 011 es (integrante, tipo, titulo, día): el cron
-- corre una vez al día y el título lleva el número de tareas, así que a una
-- misma persona no le llega dos veces el mismo aviso el mismo día.
