# cerebro — Index (Tryvex App)

> Catálogo de nodos. Leer primero en cada sesión significativa.
> Para operar este wiki, ver `cerebro/CLAUDE.md`.

**Proyecto**: Tryvex App (CRM: Leads → Clientes → Proyectos → Tareas)
**Stack**: Next.js 16 + React 19 + Supabase + shadcn/ui + dnd-kit + Anthropic SDK
**Last updated**: 2026-08-09
**Total nodes**: 1 session

---

## Sessions

### [2026-08-09-equipo-publico-landing](sessions/2026-08-09-equipo-publico-landing.md) — equipo del CRM conectado a /team de tryvex.tech (2026-08-09)

Migración `040` (columnas + vista `v_equipo_publico` con GRANT a anon, tabla
real sigue cerrada), fix de seguridad en `UrlOpcionalSchema` (bloqueaba
`javascript:...`), sección "Ficha pública" en el perfil. PR #69 abierto sin
mergear; falta aplicar migración en producción y configurar env vars en
Vercel de `Tryvex-Landing`.

---

## Decisiones de Arquitectura

### [estado-plataforma](estado-plataforma.md) — qué hay construido (2026-08-05)

`contexto-tryvex.md` cuenta **sobre qué** es el negocio; éste cuenta **qué está
construido y en qué punto quedó**.

- **Llamadas y video en malla P2P**: sin servidor de medios, sin límite de
  minutos, TURN de Cloudflare solo como respaldo, señalización por Realtime.
  Encima: chat con adjuntos, pantalla compartida con audio, música compartida y
  panel de diagnóstico.
- **Chat interno y notificaciones** por dos caminos que fallan aparte (in-app y
  Web Push; en iOS el push exige la PWA instalada).
- **Watchtower** (monitoreo de uptime) y **Vex** (agente comercial).
- **Deuda abierta** y el patrón de fondo: casi todo construido, poco encendido —
  lo que falta rara vez es código.

---

## Gotchas Conocidos

### [gotchas-supabase](gotchas-supabase.md) — base de datos y despliegue

Trampas que ya costaron caro, en este CRM y en proyectos de clientes. **Leer
antes de escribir una migración o de diagnosticar un deploy.**

| Gotcha | Regla en una línea |
|---|---|
| RLS sin GRANT = `42501` | El GRANT va en la misma migración que la policy. Ya pasó tres veces |
| La clave de servicio no ve lo mismo que la app | Decidir qué camino usa cada operación y no mezclarlos |
| El SQL Editor no es psql | Bloques cortos, etiqueta propia en `$fn$`, verificar el efecto |
| `SUBSCRIBED` no garantiza eventos | Comprobar que la tabla esté en `supabase_realtime` |
| Código nuevo con base vieja | En la ventana de deploy hay que degradar, no romper |
| Mergear no es desplegar | Se comprueba en la URL pública; un PR toma los commits del momento |
| Defaults silenciosos | Lo que produce efectos hacia afuera debe fallar ruidoso |
| El perímetro debe ser "pertenecer" | ¿Qué ve alguien que se registró y no pertenece a nada? |
| Capacidad no es rol | Una marca que no produce efecto es peor que no tenerla |

### [llamadas-webrtc](llamadas-webrtc.md) — llamadas y video (2026-08-05)

Siete bugs de una misma jornada, todos con el mismo aire: algo funcionaba a
medias y la app decía que estaba bien. **Leer antes de tocar
`components/llamadas/`.**

| Gotcha | Regla en una línea |
|---|---|
| `replaceTrack` no cambia la dirección negociada | Llenar una ranura no es abrirla: revisar `currentDirection` y renegociar |
| Puede haber varias ranuras de video y solo una sirve | Elegir la que tiene `mid`, nunca "la primera que aparezca" |
| Supabase Realtime cachea canales POR NOMBRE | Nombre único por montaje, o la suscripción queda viva sin handlers |
| Realtime solo no alcanza | Reconciliar con una consulta al montar y al recuperar el foco |
| `track.muted` no dispara render | Suscribirse a `unmute`/`mute`/`ended`, no leerlo en el render |
| Un `RefObject` en un efecto no ve el nodo nuevo | Callback ref con `useState` para observar nodos |
| Lo que no puede interrumpirse no va dentro de una vista condicional | Montarlo hermano de la vista y posicionarlo sobre un ancla |
| La pantalla compartida no vive en `local.current` | Reaplicarla al crear cada par, y reenviar el aviso al contestar una oferta |
| Realtime avisa de la fila, no de sus tablas relacionadas | Volver a pedir el registro completo (adjuntos, joins) |

Incluye además los **límites que no son bugs** (iOS y `setVolume`, el audio
inalcanzable del iframe de YouTube, los 200×200 obligatorios, el `AudioContext`
que nace en pausa, la cuota de YouTube de 100 búsquedas diarias para todo el
equipo), lo aprendido sobre **notificaciones push**, y **cómo se encontraron**,
que es lo único reutilizable: instrumentar y comparar entre participantes, en vez
de conjeturar sobre el síntoma.

⚠️ **Deuda anotada ahí**: el chat principal del CRM (`hilo-chat.tsx`) todavía
muestra las fotos ajenas como burbuja vacía hasta recargar — el mismo agujero que
se arregló en el chat de la llamada.
