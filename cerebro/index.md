# cerebro — Index (Tryvex App)

> Catálogo de nodos. Leer primero en cada sesión significativa.
> Para operar este wiki, ver `cerebro/CLAUDE.md`.

**Proyecto**: Tryvex App (CRM: Leads → Clientes → Proyectos → Tareas)
**Stack**: Next.js 16 + React 19 + Supabase + shadcn/ui + dnd-kit + Anthropic SDK
**Last updated**: 2026-08-05
**Total nodes**: 0 sessions

---

## Sessions

*(vacío — se poblará con cada sesión de trabajo significativa)*

---

## Decisiones de Arquitectura

*(vacío — se documentarán aquí las decisiones clave del proyecto)*

---

## Gotchas Conocidos

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

Incluye además los **límites que no son bugs** (iOS y `setVolume`, el audio
inalcanzable del iframe de YouTube, los 200×200 obligatorios, el `AudioContext`
que nace en pausa) y **cómo se encontraron**, que es lo único reutilizable:
instrumentar y comparar entre participantes, en vez de conjeturar sobre el
síntoma.
