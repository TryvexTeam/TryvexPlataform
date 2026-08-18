# cerebro — Index (Tryvex App)

> Catálogo de nodos. Leer primero en cada sesión significativa.
> Para operar este wiki, ver `cerebro/CLAUDE.md`.

**Proyecto**: Tryvex App (CRM: Leads → Clientes → Proyectos → Tareas)
**Stack**: Next.js 16 + React 19 + Supabase + shadcn/ui + dnd-kit + Anthropic SDK
**Last updated**: 2026-08-18
**Total nodes**: 3 sessions + protocolo

---

## Sessions

### [2026-08-18-prp-008-asignaciones](sessions/2026-08-18-prp-008-asignaciones.md) — PRP-008: asignación automática + fases 1-3 aplicadas (2026-08-18)

**La regla que manda**: contactar a un lead ES asignárselo. El primero que le
escribe queda `owner`, los siguientes `colaborador`; el bot no asigna. Nació de
un dato demoledor: **541 leads, 0 con `responsable_id`** — la asignación manual
ya existía y nunca se usó.

Migraciones **051** (tabla puente + RLS finas para auto-asignarse a citas) y
**052** (autoría real de mensajes con FK al integrante) **aplicadas a producción**
y verificadas en transacción revertida. Fase 3: stack de avatares en
`leads-inbox.tsx`. Ronda Avengers: 6/6 tareas aceptadas por $1.46.

**Error propio caro**: agregar una FK dejó `eventos_asistentes` con dos FKs a
`dim_integrantes` → embed ambiguo → **500 en el calendario de producción**.
Corregido nombrando la FK. Regla nueva en `log.md`.

Pendiente: abrir el PR (el fix está sin desplegar), `/settings` que no carga
para nadie, y las fases 4-6.

### [2026-08-17-avengers-dashboard](sessions/2026-08-17-avengers-dashboard.md) — insumos del dashboard + metodología Avengers (2026-08-17/18)

**Dónde quedamos.** T-001 (inventario de KPIs) ACEPTADA: 28 tablas, 38 KPIs con
fórmula real, 11 gaps; el dashboard actual solo consulta 4 contadores. T-002
(propuesta de asignación de leads/citas a integrantes) SIN ENTREGABLE — decisión
pendiente entre GLM-5.2 gratis, Codex, o redactarla Jarvis.

Hallazgo que cambia el enfoque: `fact_leads.responsable_id`, `tarea_responsables` y
`eventos_asistentes` **ya existen** → es reconciliación, no creación. Pendientes del
señor Ignacio: activar modelos chinos y re-loguear OpenCode Go + Copilot.

### [2026-08-09-equipo-publico-landing](sessions/2026-08-09-equipo-publico-landing.md) — equipo del CRM conectado a /team de tryvex.tech (2026-08-09)

Migración `040` (columnas + vista `v_equipo_publico` con GRANT a anon, tabla
real sigue cerrada), fix de seguridad en `UrlOpcionalSchema` (bloqueaba
`javascript:...`), sección "Ficha pública" en el perfil. PR #69 abierto sin
mergear; falta aplicar migración en producción y configurar env vars en
Vercel de `Tryvex-Landing`.

---

## Decisiones de Arquitectura

### [protocolo-avengers](protocolo-avengers.md) — cómo se despacha trabajo a escala (2026-08-17)

Metodología bautizada por el señor Ignacio: Jarvis orquesta modelos que no son
suyos (Opus 4.6 dentro del CLI de Google vía AGY, Opus 5 vía OpenCode/Zen) y esos
workers **crean sus propios subagentes** — 2 despachados, 7 cabezas leyendo en el
pico. Lo que evita el caos no es el heroísmo del modelo sino el contrato: spec
numerada auditable por grep, un dueño por archivo, veredicto objetivo y prohibido
inventar (`NO VERIFICADO` obligatorio).

Incluye la secuencia para lanzarlos **dentro de Orca** (con `wt` quedan invisibles
al IDE), por qué no se usa `worker-start --inject` (degrada los modelos), y el
auto-blindaje de 6 errores reales: despachar sin `git pull`, `Test-Path` sobre
entregables rancios, `.next` sucio rompiendo `tsc`, el `Write aborted` de OpenCode
(era permiso sin TTY, no tamaño), y `input_accepted` que no prueba que el worker
trabaje. Incluye el control de TUI por `terminal send`: **cualquier CLI es
orquestable aunque Orca no lo tenga en su catálogo**, y AGY ya no paga relecturas
para continuar una tarea.

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
