# PRP-008 — Dashboard operativo + asignación de leads y citas

| Campo | Valor |
|---|---|
| Estado | **PENDIENTE DE APROBACIÓN** |
| Fecha | 2026-08-18 |
| Rama base | `docs/cerebro-completo` (sincronizada con `origin/main` en `a47bb75`) |
| Insumos verificados | T-001 (KPIs), T-002 (asignación), T-003 (diseño), T-004 (responsive), T-005 (endpoints), T-006 (UI) — **todos aceptados** |
| Insumos pendientes | ninguno |

---

## 1. Objetivo

Reemplazar el dashboard actual —4 contadores y una lista de 20 leads— por un centro
operativo real, y cerrar el circuito de responsabilidad: **cada lead y cada cita con
personas asignadas**, para que las métricas por integrante existan de verdad.

Estado final: al abrir la app desde el celular, el señor Ignacio ve en el primer
viewport qué está pendiente hoy, quién lo tiene, y dónde está el equipo.

## 2. Por qué

Hoy el dashboard no consulta jornadas, finanzas, eventos, interacciones, WhatsApp,
llamadas ni actividad. La plataforma **captura** todo eso pero no lo devuelve. Y sin
asignación, ninguna métrica puede responder "¿quién?".

## 3. Qué se construye

### 3.0 Regla de negocio: la asignación es AUTOMÁTICA por contacto

> Definida por el señor Ignacio el 2026-08-18, tras detectar que el modelo manual
> ya había fracasado en silencio: **541 leads, 0 con `responsable_id`**. La columna
> existe desde el esquema inicial y no se usó ni una vez. Nadie entra a un lead a
> marcar "este es mío" antes de escribirle.

1. **El primero que le habla a un lead queda como `owner`.** No hay paso manual.
2. **Quien escriba después entra como `colaborador`.** Varias personas pueden
   compartir el mismo lead.
3. **El bot Vex NO asigna.** Un mensaje automático no crea propiedad.
4. **Un envío sin autor identificable tampoco asigna.** Hoy 5 de 6 mensajes
   salientes figuran como `"Equipo"`, que no es una persona.
5. **Se puede sumar gente a mano** al chat de un lead. La asignación manual queda
   como complemento (reasignar, sumar a alguien que no escribió), nunca como el
   mecanismo principal.
6. **Los asignados se ven como stack de avatares** en la esquina inferior derecha
   de la tarjeta del lead, replicando el patrón de tareas.

**Bloqueante técnico para esta regla:** `mensajes_wa.enviado_por` es **texto libre**
(`"Equipo"`, `"Ignacio"`, `"Vex"`, `null`), no una FK a `dim_integrantes`. Mientras
siga así, la asignación automática por WhatsApp no se puede derivar: no hay a quién
asignar. Arreglarlo es parte de la fase 2 y toca el código de envío.

Y `interacciones_lead` —la tabla que sí tiene `integrante_id` y sería la fuente
natural— está **vacía (0 filas)**: nadie la escribe hoy. La fase 2 debe empezar a
poblarla.

### 3.1 Asignación (base de todo lo demás)
- Tabla puente `lead_asignaciones` con rol `owner` / `colaborador`.
- Extensión de `eventos_asistentes` (**ya existe con datos**) con `rol`,
  `asignado_por`, `created_at` — no se crea tabla paralela.
- Dos caminos para citas: asignar al crear, y auto-asignarse a una existente.
- UI: stack de avatares con overflow `+N` en la tarjeta de lead, esquina inferior
  derecha, replicando el patrón de tareas.

### 3.2 Dashboard
- Dos vistas: **personal** ("lo mío") y **equipo**, apoyadas en `lib/repos/permisos.ts`.
- Mobile-first real (390px es el caso de uso primario, no el degradado).
- KPIs seleccionados del catálogo de 38 de T-001. Selección final en fase 5.

### 3.3 Fuera de alcance de este PRP
Los 11 gaps de datos de T-001 (G1–G11). El más caro —**G1, historial de transiciones
de estado**— hace incalculables el tiempo por etapa y la conversión real. Se propone
como PRP aparte; sin él, el dashboard no puede mostrar velocidad de pipeline.

## 4. Criterios de éxito

1. Un lead puede tener varios responsables con rol, y se ve en su tarjeta sin romper el drag & drop de `@dnd-kit`.
2. Un integrante puede sumarse solo a una cita, y **no** puede asignar a terceros ni auto-nombrarse `owner` de la cita de otro (garantizado por RLS, no por UI).
3. El dashboard responde "qué tengo yo hoy" y "cómo va el equipo" sin scroll horizontal en 390px.
4. `npx tsc --noEmit` exit 0 y build de producción limpia al cerrar cada fase.
5. Ninguna query a Supabase fuera de `lib/repos/`, y toda respuesta nueva en formato `{ success, data }` / `{ success, error }`.

## 5. Contexto verificado

### 5.1 Ya existe (esto es reconciliación, no creación)

| Pieza | Dónde | Estado |
|---|---|---|
| `fact_leads.responsable_id` | `lib/types/database.ts:121` | Asignación single, a migrar a multi |
| `tarea_responsables` | `lib/repos/tareas.ts:20` | Patrón puente a replicar; **sin** columna de rol |
| `eventos_asistentes` | `lib/repos/eventos.ts:24,39` | Multi-asistente ya funcionando |
| `is_integrante()` | `supabase/migrations/000_schema_inicial.sql:196` | Función RLS base |
| Vistas pre-agregadas | `jornadas_resumen`, `finanzas_resumen_mensual` | Listas para consumir |
| `dim_integrantes` | — | Ya trae `color`, `avatar_url`, `horario` |

### 5.2 Deuda que este trabajo se topa de frente (T-005)

- **24 archivos bajo `app/api/` consultan Supabase directamente**, saltándose `lib/repos/`. Cinco no usan repo alguno: `agentes/mensajes`, `presencia`, `vex/chat`, `wa/leido`, `wa/no-leidos`.
- **18 endpoints** no devuelven el formato de respuesta obligatorio.
- Decisión requerida: se reconcilian los que toque el dashboard, o se congela la deuda y solo se exige la regla al código nuevo. **Propuesta: lo segundo**, más un PRP de saneamiento aparte. Mezclar refactor con feature hace irrevisable el PR.

### 5.3 Restricciones de UI reales (T-006)

- **No hay librería de gráficos instalada.** Ni `recharts` ni equivalente. Decisión pendiente: agregar dependencia vs. componer con SVG inline y CSS.
- `vaul` instalado y `drawer`, `sheet`, `tabs`, `skeleton`, `scroll-area`, `table` con **cero uso** — disponibles sin instalar nada.
- `app/globals.css` define **solo tokens de color y radio**. No hay tokens de sombra, tipografía, espaciado ni animación: hay que crearlos para lograr coherencia visual.
- Tailwind v4 CSS-first: no existe `tailwind.config.*`.
- 86 componentes fuera de `ui/` llevan la directiva de cliente (con comilla simple).

## 6. Blueprint por fases

> Cada fase deja la app funcional y verificable. No se pasa de fase sin veredicto objetivo.

### Fase 1 — Datos y RLS

Migración `051_asignaciones_leads_eventos.sql`: crear `lead_asignaciones`
(PK compuesta anti-duplicado, FKs `ON DELETE`, índice por `integrante_id`),
extender `eventos_asistentes`, y reemplazar la policy "creador gestiona asistentes"
por policies finas de SELECT / INSERT / DELETE / UPDATE.
Backfill de `responsable_id` hacia `lead_asignaciones` con rol `owner`.

**Verificación:** SQL aplicado sin error; prueba con un usuario que no es el creador confirma que puede auto-asignarse y **no** puede asignar a terceros; tipos regenerados.

### Fase 2 — Repos, tipos y API

Funciones nuevas en `lib/repos/leads.ts` y `lib/repos/eventos.ts` (asignar,
desasignar, listar asignaciones de una entidad, listar entidades de un integrante,
lectura agregada para dashboard). Tipos y schemas Zod en `lib/types/asignacion.ts`.
Endpoints bajo `app/api/`.

**Verificación:** `tsc` exit 0; curl de cada endpoint con status y body esperados.

### Fase 3 — UI de leads

Componente compartido de stack de avatares; integración en la tarjeta de lead
(esquina inferior derecha, sin romper el drag del kanban); selector de integrantes
con popover en escritorio y drawer Vaul en móvil; feedback optimista con rollback
y toast Sonner al fallar.

**Verificación:** screenshot en 390px y 1440px; drag & drop del kanban sigue funcionando; área táctil ≥44px.

### Fase 4 — UI de calendario

Asignación al crear la cita y botón "Asignarme" / "Quitarme" en el detalle.
Visualización del responsable en la vista de calendario.

**Verificación:** screenshot de ambos caminos; un integrante no creador logra auto-asignarse desde la UI.

### Fase 5 — Dashboard

Dirección visual definida en T-003: **"Panel de Mando"** — una sola superficie de
scroll, sin sidebar interno, tomando `reloj-jornada.tsx` como referencia estética y
reutilizando el vocabulario existente (`.glass`, `.hub-card`, `HaloAvatar`,
`--tx-bg-primary`, acento dinámico). Nada de lenguaje visual nuevo.

**12 KPIs seleccionados** del catálogo de 38, con la vista personal como
protagonista del primer viewport: leads sin contactar (#2), tareas vencidas (#20),
carga de trabajo (#21), interacciones semanales (#7), horas trabajadas (#11),
próximas citas (#16), más los de equipo.

**Bento responsive** con `col-span` redistribuidos por breakpoint —no columnas
apiladas sin criterio—: 1 col en 390px, 2 en 768px, 3 en 1024px, 4 con fila hero
en 1440px, con `max-w-[1400px]` para no estirarse en monitores anchos.

**Gráficos sin dependencia nueva:** sparklines y barras compuestas con SVG inline
y CSS, usando `var(--…)` para respetar el acento dinámico de `applyTheme()`.

**Reglas heredadas de T-004** (patrones del propio proyecto, no inventos):
- Tablas y contenido ancho van en `overflow-x-auto`, como ya hace
  `components/finanzas/finanzas-workspace.tsx:329`. **Nunca** `overflow-hidden`.
- Ningún ancho fijo en px sin breakpoint dentro de un contenedor sin scroll.
- Área táctil mínima 44px en todo control accionable (el dashboard actual tiene
  botones de 26–32px; se corrigen de nacimiento en el nuevo).
- Ningún control se revela solo con hover: siempre alternativa táctil o `focus-within`.

**Verificación:** screenshots en 390 / 768 / 1024 / 1440 sin scroll horizontal; sin datos y con datos; auditoría de contraste y foco.

### Fase 6 — Limpieza (condicionada a aprobación explícita)

Eliminar `fact_leads.responsable_id` y sus referencias tras confirmar el backfill.
**Irreversible: requiere aprobación del señor Ignacio en el momento, no la de este PRP.**

## 7. Decisiones que requieren al dueño del producto

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Librería de gráficos | Agregar dependencia vs. SVG/CSS propio | **RESUELTA por T-003: SVG/CSS propio**, sin dependencia nueva. Costo: mantener esos componentes a mano |
| D6 | Vista equipo: tab o ruta propia | Segmented en la misma página vs. `/dashboard/equipo` | **DECIDIDA por el señor Ignacio (2026-08-18): segmented en la misma página.** Sin cambio de ruta; el estado de la vista se mantiene en la URL como search param para que sea compartible |
| D7 | Quién ve finanzas y jornadas del equipo | Permisos `ver_finanzas`, `ver_jornadas_equipo`, `gestionar_finanzas` | Definir el reparto antes de la fase 5 |
| D2 | Deuda de los 24 endpoints | Reconciliar ahora vs. PRP aparte | **PRP aparte** — no mezclar refactor con feature |
| D3 | Historial de transiciones (G1) | Ahora vs. después | Después, pero saberlo: sin él no hay velocidad de pipeline |
| D4 | Drop de `responsable_id` (fase 6) | Sí vs. mantener por compatibilidad | Decidir recién con la fase 1 en producción |
| D5 | Tokens de diseño faltantes | Crear set completo vs. mínimo necesario | Mínimo necesario: T-003 se apoya en el vocabulario existente, no requiere set completo |

## 8. Riesgos

- **RLS mal planteada = fuga de datos entre integrantes.** La fase 1 no se cierra con "la policy está escrita", sino probando con un usuario que NO es el creador.
- **El kanban de leads usa `@dnd-kit`**: agregar elementos interactivos dentro de la tarjeta puede capturar el gesto de arrastre. Verificar con drag real, no visualmente.
- **Agregaciones costosas**: T-001 marca las consultas caras y dónde poner índice o vista. Respetarlo o el dashboard se vuelve lento con los datos reales.

## 8.b Bugs preexistentes detectados durante la investigación

No son parte de este PRP, pero salieron verificados y conviene no perderlos:

| Bug | Dónde | Severidad |
|---|---|---|
| `var(--tx-ink)` **no existe** (solo `--tx-ink-primary/secondary/muted`) | `components/leads/lead-chat-wa.tsx:243,256,281,282,339` | Texto cae a color heredado en el chat WA. Fix de una línea |
| Tablas en `overflow-hidden`: contenido cortado e inalcanzable en 390px | `components/clientes/clientes-lista.tsx:54`, `components/leads/leads-pipeline.tsx:134`, `components/clientes/cliente-detalle.tsx:243` | Alta para uso móvil |
| Inbox de ancho fijo `w-[360px]` en padre con `overflow:hidden` | `components/leads/leads-inbox.tsx:143` (padre `leads-workspace.tsx:62`) | En 390px deja ~30px al panel vecino |

## 9. Aprendizajes (Auto-Blindaje)

_Se completa durante la ejecución._
