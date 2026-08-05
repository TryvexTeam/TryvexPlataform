---
type: gotchas
area: supabase
date: 2026-08-05
slug: gotchas-supabase
title: "Supabase y despliegue: las trampas que ya nos costaron caro"
---

# Supabase y despliegue — trampas conocidas

Cada una salió de un incidente real, en este CRM o en proyectos de clientes. Se
repiten lo suficiente como para justificar leerlas antes de tocar la base.

> Este repo es **público**: acá van los patrones técnicos, nunca datos de
> clientes, teléfonos, llaves ni cadenas de conexión.

---

## RLS sin GRANT es una puerta cerrada con llave puesta

**Síntoma:** `42501 permission denied`, con las policies perfectamente escritas.

Son dos permisos distintos y hacen falta los dos: el **GRANT** decide si el rol
puede tocar la tabla; la **policy** decide qué filas ve. Sin GRANT, la policy más
permisiva del mundo no sirve de nada.

```sql
GRANT SELECT, INSERT, UPDATE ON mi_tabla TO authenticated;
GRANT ALL ON mi_tabla TO service_role;
```

**Regla:** el GRANT va **en la misma migración** que la policy, siempre pegado.
Ya pasó tres veces; las tres el diagnóstico se fue a buscar el error en la
policy, que estaba bien.

## La clave de servicio no ve lo mismo que la app

Una vista puede recortar el listado mientras la clave de servicio lo ve entero.
Si una acción de servidor usa la clave de servicio y la pantalla usa una vista
con RLS, **están mirando dos realidades distintas** — y la diferencia aparece
como "en la lista no está pero el sistema dice que existe".

**Regla:** decidir explícitamente qué camino usa cada operación y no mezclarlos
dentro de un mismo flujo.

## El SQL Editor de Supabase no es psql

Tres formas conocidas de que mutile una migración que en local corre perfecta:

- **Manda todo como una sola transacción.** Varios bloques `DO` encadenados o un
  `format()` con `%I` pueden salir mal.
- **Corta los `$$`.** Usar etiquetas propias (`$fn$`) y bloques cortos.
- **Prefiere ASCII y SQL sin prosa.** Los comentarios largos con acentos han
  llegado partidos.

**Regla:** migraciones en bloques cortos, con etiqueta propia en las funciones, y
verificar el efecto después de correrlas — no asumir que porque no dio error se
aplicó entera.

## Realtime: cuatro trampas

1. **Cachea los canales POR NOMBRE**, y `removeChannel` es asíncrono. Nombre
   único por montaje o la suscripción queda viva **sin handlers**. Detalle en
   [llamadas-webrtc](llamadas-webrtc.md).
2. **`SUBSCRIBED` no significa que vayan a llegar eventos.** Una tabla que no
   está en la publicación se suscribe igual y nunca emite nada:
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```
3. **El evento trae la fila, no sus tablas relacionadas.** Adjuntos, joins y
   agregados no vienen: hay que volver a pedir el registro.
4. **Realtime solo no alcanza.** Reconciliar con una consulta al montar y al
   recuperar el foco: las pestañas de fondo se pierden eventos.

## Migraciones: código nuevo con base vieja

Entre que se despliega el código y se aplica la migración hay una ventana en la
que el código nuevo consulta columnas que todavía no existen.

**Regla:** en esa ventana el código debe **degradar, no romper**. Y el orden
importa: primero la migración, después el deploy, cuando se puede.

## Mergear no es desplegar, y `main` no es producción

- Un PR **"Merged"** puede haber ido a una rama base equivocada y no haber
  llegado nunca a `main`. Verificar la base del PR.
- Un `main` verde no significa que el sitio cambió. **Se comprueba en la URL
  pública.**
- Un PR se mergea con **los commits que existan en ese instante**: no seguir
  pusheando a una rama con PR abierto — el arreglo queda fuera y se termina
  diagnosticando sobre código viejo.
- Los arreglos de cliente exigen **recargar la pestaña**: una pestaña abierta
  sigue ejecutando el JavaScript anterior.

## Defaults silenciosos: el más caro de todos

Un valor de prueba que queda como default y nadie ve **no es un detalle**: en un
proyecto de cliente, un número de prueba dejado en la configuración mandó
notificaciones de reservas reales a un desconocido durante días. Nadie lo
detectó porque el sistema funcionaba: mandaba, sin error.

**Regla:** un default que produce efectos hacia afuera (mensajes, correos,
cobros) debe **fallar ruidoso** si no está configurado, nunca caer en un valor de
prueba. Un fallback optimista es una mentira estructural.

## Permisos: el perímetro debe ser "pertenecer", no "tener cuenta"

En una auditoría del CRM apareció que el perímetro real era **tener una cuenta**,
no **ser del equipo**. Son cosas distintas y la diferencia es todo.

**Regla:** al escribir una policy, preguntarse qué pasa con alguien que se
registró y no pertenece a nada. Si la respuesta es "ve algo", está mal.

## Capacidad no es rol

Marcar a alguien con un rol no lo habilita a aparecer donde el negocio espera. En
un proyecto de cliente, un rol asignado no hacía que la persona atendiera citas:
la capacidad estaba en otra tabla. Una marca que no produce ningún efecto es peor
que no tenerla — parece configurada.

**Regla:** si un rol debe habilitar algo, que lo habilite de verdad; si no, que
no exista como opción.

## Texto libre donde debería haber lista cerrada

Un campo de texto libre que después se valida contra una lista fija produce
rechazos que **le salen al cliente final** y que él no puede resolver. Si el
conjunto de valores es cerrado, la interfaz debe ofrecer la lista, no un campo
donde escribir.
