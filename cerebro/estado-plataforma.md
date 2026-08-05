---
type: estado
area: plataforma
date: 2026-08-05
slug: estado-plataforma
title: "Qué hay construido en la plataforma, y qué está a medio encender"
---

# Estado de la plataforma — 2026-08-05

Complementa [contexto-tryvex](contexto-tryvex.md), que cuenta **sobre qué** es el
negocio. Este cuenta **qué está construido y en qué punto quedó**.

> Repo **público**: sin datos de clientes, teléfonos, llaves ni cadenas de
> conexión.

---

## Llamadas y video — malla P2P, sin costo por minuto

Llamadas de voz y video dentro del CRM, en **malla WebRTC**: cada participante
abre una conexión directa con cada otro. No hay servidor de medios en el medio,
así que **no hay límite de minutos ni costo por llamada**. El precio es que cada
uno sube su video N−1 veces, y por eso la resolución baja cuando entra gente.

- **TURN de Cloudflare** como respaldo cuando la conexión directa no se puede
  levantar. Eso sí consume cuota, y la cabecera de la llamada muestra si va
  **directa o por relay** — verlo en el momento evita deducirlo después mirando
  un panel.
- **Señalización por Supabase Realtime**: ofertas, respuestas y candidatos ICE.
  Nada de eso toca la base.
- Encima se construyó: chat lateral con adjuntos, pantalla compartida con audio,
  reproductor de música compartido con comandos estilo bot, y un panel de
  diagnóstico que mide paquetes por persona.

**Antes de tocar nada acá, leer [llamadas-webrtc](llamadas-webrtc.md).** Una
jornada entera se fue en nueve bugs de este subsistema, todos documentados con su
regla.

## Chat interno y notificaciones

Chat por conversaciones con hilos, reacciones, fijados, adjuntos y presencia. Las
notificaciones salen por dos caminos que **no son el mismo** y fallan aparte:

- **In-app** (la campanita): fila en `notificaciones`, llega por Realtime.
- **Web Push**: al teléfono o al PC aunque la app esté cerrada, con llaves VAPID.

En **iOS el push exige la PWA instalada** en la pantalla de inicio. En el
navegador normal no llega, y no hay forma de cambiarlo.

## Diagnóstico: la herramienta que resolvió el caso difícil

El panel de diagnóstico de la llamada mide, por persona, paquetes de audio y de
video enviados y recibidos, la dirección negociada de la ranura de video y
cuántas ranuras hay.

No es un adorno: **la contradicción entre los diagnósticos de dos participantes
fue lo que identificó la causa raíz** de que nadie viera las transmisiones. Antes
de eso, tres intentos de arreglo apuntaron al lugar equivocado.

**Patrón que vale para todo el CRM:** cuando algo "no funciona" y el código se ve
bien, la salida no es adivinar mejor — es **instrumentar y comparar el mismo dato
entre las partes**.

## Watchtower — monitoreo de uptime

Servicio propio de monitoreo multicloud, publicado aparte. Vigila que lo que se
entregó siga en pie, que es parte de lo que se cobra como recurrencia.

## Vex y el asistente comercial

**Vex** es el agente comercial dentro del CRM: redacta la copy de contacto y
responde consultas sobre la cartera. Hay además un diseño de asistente de ventas
con recuperación sobre material de metodología comercial, pensado para operar sin
costo de API.

## Lo que está construido y poco encendido

El patrón se repite y conviene tenerlo presente al planificar: **la cadena
completa existe y se probó punta a punta; lo que falta rara vez es código**. Es
que alguien cargue una llave, apruebe un envío o apriete un botón.

Los leads no son el cuello de botella: hay cientos sin contactar. El dinero está
en **activar el contacto**.

## Deuda conocida y abierta

| Qué | Dónde |
|---|---|
| Las fotos ajenas salen como burbuja vacía hasta recargar | `components/chat/hilo-chat.tsx` — el mismo agujero que se arregló en el chat de la llamada |
| Los agentes firman con la cuenta de su humano | No se puede saber quién hizo qué |
| El deploy de producción es manual | Un merge a `main` no despliega solo |
