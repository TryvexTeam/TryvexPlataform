---
type: gotchas
area: llamadas
date: 2026-08-05
slug: llamadas-webrtc
title: "Llamadas: los siete bugs que costaron una jornada, y cómo no repetirlos"
---

# Llamadas — lecciones de la jornada del 2026-08-05

Siete bugs distintos, todos en el mismo sistema, todos con el mismo aire de
familia: **algo funcionaba a medias y la app decía que estaba bien**. Ninguno se
encontró leyendo el síntoma; todos se encontraron midiendo.

Archivos: `components/llamadas/use-llamada.ts`, `panel-llamada.tsx`,
`proveedor-llamadas.tsx`, `use-grilla-video.ts`.

---

## 1. WebRTC: `replaceTrack` no cambia la dirección negociada

**Síntoma:** "todos me ven y yo no veo a nadie". El diagnóstico decía
`video: envío 0 · recibo 0 · ranura sendonly`.

Una ranura (transceiver) se negocia con una dirección: `sendrecv`, `sendonly`,
`recvonly`. Si quedó `sendonly`, **por ahí no entra video jamás**, por mucho que
el otro transmita. `replaceTrack` llena el sender pero no toca la dirección.

**Regla:** llenar una ranura no es lo mismo que abrirla. Antes de mandar video,
verificar `currentDirection` y, si no es `sendrecv`, cambiar `direction` **y
renegociar** — cambiar la dirección no tiene efecto hasta la próxima oferta.

**Y la otra mitad:** quien solo mira no ejecuta nada de eso. Si su ranura quedó
torcida, nada de lo que haga el que transmite la arregla. Hace falta repararla
también desde el lado que recibe: al llegar el aviso de "estoy compartiendo", y
como red de seguridad cada pocos segundos, porque los avisos se pierden.

**Con tope de reintentos.** Una reparación que renegocia cada dos segundos sin
límite es peor que el bug: en una malla son N ofertas por segundo. Cuatro
intentos, y si no se logra, decirlo en consola.

## 2. Puede haber más de una ranura de video, y solo una sirve

**Síntoma:** los dos lados de la **misma** conexión reportaban direcciones
distintas (`sendonly` en uno, `sendrecv` en el otro). Eso es imposible: las
direcciones son espejo obligatorio. Salvo que cada lado esté mirando un
transceiver distinto.

Las ranuras de sobra aparecen solas: una la crea `addTrack` (cuando hay cámara
local), otra `addTransceiver` (cuando no la hay), y cada renegociación puede
sumar otra. **Solo la que quedó atada a una m-line del SDP transporta algo**, y
`mid` es lo que la distingue — es `null` mientras no está asociada.

**Regla:** nunca tomar "el primer transceiver de video que aparezca". Buscar el
que tiene `mid`. Y dejar las otras ranuras vacías: una pista colgada en un sender
sin m-line produce `envío 0` con la ranura diciendo `sendrecv`.

## 3. Supabase Realtime cachea los canales POR NOMBRE

**Síntoma:** llegaba la notificación push de una llamada y en la app no aparecía
nada. Ni modal, ni timbre.

`supabase.channel('nombre-fijo')` con `removeChannel` asíncrono: en cualquier
remontaje, el canal nuevo se topa con el anterior todavía vivo. Los `.on()` se
agregan a un canal ya suscrito —que es un error— y **la suscripción queda en pie
sin handlers**. El socket sigue conectado, no hay nada roto a la vista, y los
eventos no llegan nunca.

**Regla:** nombre único por montaje, siempre: `` `cosa-${++contador}` ``. Ya lo
hacían `use-datos-vivos.ts` y `chat-llamada.tsx`; llamadas era el único lugar que
no, y fue el único que falló.

**Corolario:** registrar el estado de `subscribe()`. Una suscripción caída es
invisible.

## 4. Realtime solo no alcanza: hay que reconciliar

**Síntoma:** llegaba la push con la app cerrada, y al abrirla no había forma de
entrar a la llamada.

Enterarse por el evento exige estar suscrito **en ese instante exacto**. Pestaña
cerrada, dormida o recién abierta: el evento ya pasó y no vuelve.

**Regla:** todo estado que llega por Realtime necesita además una consulta de
reconciliación al montar y al recuperar el foco. Los navegadores congelan sockets
en pestañas de fondo, así que volver al frente es justo cuando hay que preguntar.

## 5. Las propiedades vivas de un track no disparan render

**Síntoma:** el video llegaba —los paquetes subían— y la app mostraba el avatar.
Y era una lotería: lo veía uno y el otro no, distinto en cada navegador.

`track.muted` y `track.readyState` cambian solos, fuera de React, sin avisarle a
nadie. Una pista remota nace `muted` y se destapa cuando el otro empieza a
mandar. Si ese instante caía entre dos renders, el componente se quedaba con
`muted = true` **para siempre**.

**Regla:** no leer propiedades vivas del DOM/media en el cuerpo del render y dar
por hecho que se van a actualizar. Suscribirse a sus eventos (`unmute`, `mute`,
`ended`) y guardar el resultado en estado.

## 6. `RefObject` en un efecto no se entera de que el nodo cambió

**Síntoma:** al minimizar la llamada y volver, la grilla quedaba con los recuadros
del tamaño anterior. Sin arreglo salvo recargar.

`useEffect(..., [contenedor])` con un `RefObject` corre **una sola vez**: el
objeto ref nunca cambia de identidad. Al remontar, el `ResizeObserver` seguía
observando el nodo viejo, ya fuera del documento.

**Regla:** para observar un nodo (ResizeObserver, IntersectionObserver, medir
posiciones), usar **callback ref** con `useState`, no `useRef`. El nodo como
dependencia es lo que hace que un remontaje vuelva a suscribir.

## 7. Un componente montado dentro de una vista condicional se desmonta

**Síntoma:** minimizar la llamada cortaba la música, y al volver aparecía el
video negro recargando.

El reproductor vivía dentro de la rama de JSX que cambia al minimizar. Para React
eso no es "el mismo componente que se mueve": es uno que se destruye y otro que
nace. El iframe moría con él.

**Regla:** lo que no puede interrumpirse (audio, conexiones, reproductores) va
**hermano** de la vista, nunca dentro. Si además tiene que verse, posicionarlo
sobre un ancla que sí vive en el layout. Ya se había aprendido con la capa de
audio; el reproductor repitió el error.

---

## Límites que no son bugs — no perder tiempo buscándoles arreglo

- **iOS ignora `setVolume()`.** El volumen de cualquier audio web lo manda el
  botón físico; leerlo devuelve siempre 1. Es del sistema operativo. Un slider
  que no controla nada se lee como app rota: en iOS no se dibuja y se explica.
- **El audio de un iframe de YouTube es inalcanzable.** Cross-origin: no se puede
  enchufar a WebAudio ni pasarle un `GainNode`, así que no hay forma de subirlo
  por encima de 100%. La única palanca real es **bajar las voces**, que sí pasan
  por WebAudio. Extraer la pista para amplificarla es lo que le costó el acceso a
  la API a Groovy y Rythm.
- **El reproductor de YouTube exige 200×200 px visibles** (Required Minimum
  Functionality). No se puede esconder con `display:none` ni encoger. Por eso
  "minimizar" lo convierte en miniatura, no lo apaga.
- **Un `AudioContext` nace en pausa** hasta que la persona toca la página, y una
  llamada entrante no es un gesto suyo. `resume()` en ese momento no sirve: la
  política pide un gesto **previo**. Hay que desbloquearlo con el primer clic de
  la sesión y no cerrarlo nunca.

---

## Cómo se encontraron: la única parte que se puede reutilizar

Los primeros intentos fueron conjeturas sobre el síntoma y no dieron en nada. Lo
que resolvió el caso fue **instrumentar y comparar**.

1. **Medir lo que falla, no lo que se le parece.** El panel contaba paquetes de
   audio, y el audio iba perfecto. Agregar el contador de video y la dirección
   de la ranura convirtió "no veo su pantalla" —que tiene dos causas opuestas—
   en un dato con una sola lectura.
2. **Pedir el mismo dato a todos los participantes.** Un diagnóstico solo dice
   poco. Tres, comparados, mostraron una contradicción imposible (direcciones que
   no eran espejo) y esa contradicción **era** la causa.
3. **Un dato objetivo por hipótesis.** "¿Está la tabla en la publicación de
   Realtime?" se responde con un `SELECT`, no discutiendo. Descartar rápido vale
   tanto como confirmar.
4. **Nada verificado en el navegador es "arreglado".** `tsc` y `build` limpios
   dicen que compila, no que funciona. Reportarlo así.

## Y una lección de proceso, que costó cuatro repeticiones

**Un PR se mergea con los commits que existan en ese momento.** Cuatro veces se
mergeó un PR mientras se seguía trabajando en la misma rama, y cuatro veces el
arreglo quedó fuera de `main`. Se probaba la instrumentación nueva sobre el
código viejo y el síntoma "no cambió nada" apuntaba al lugar equivocado.

**Regla: una rama por arreglo.** No volver a pushear a una rama que ya tiene PR
abierto. Y antes de diagnosticar un "sigue fallando", verificar qué hay
realmente en `main`:

```bash
git fetch origin && git merge-base --is-ancestor <commit> origin/main
```

**Y mergear no es desplegar.** Confirmar en la URL pública. Y como estos
arreglos viven en el cliente: **una pestaña abierta sigue ejecutando el
JavaScript anterior**. Si no recargan todos, se prueba lo de antes.
