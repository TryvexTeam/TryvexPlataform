# 2026-08-18 — PRP-008: dashboard operativo + asignación de leads y citas

> Sesión larga y productiva. Se cerró la ronda de investigación pendiente, se
> escribió el PRP completo, y se implementaron y aplicaron las fases 1-3.
> También se rompió y arregló el calendario en producción.

## Lo que se entregó

### Ronda Avengers cerrada — 6 tareas, 6 aceptadas

| Tarea | Worker | Resultado |
|---|---|---|
| T-001 inventario de KPIs | AGY · Opus 4.6 | ✅ (sesión anterior) 28 tablas, 38 KPIs, 11 gaps |
| T-002 propuesta de asignación | OpenCode Go · GLM-5.3 | ✅ 34 KB, 14/14 puntos, cero rutas inventadas |
| T-003 diseño del dashboard | OpenCode Go · DeepSeek V4 Pro | ✅ 28 KB, 14/14, "Panel de Mando" |
| T-004 auditoría responsive | OpenCode Go · Kimi-K3 | ✅ 8/8, encontró un bug real de producción |
| T-005 inventario de endpoints | subagente Sonnet effort bajo | ✅ 65 endpoints, 24 violaciones de la regla de repos |
| T-006 inventario UI + tokens | subagente Sonnet effort bajo | ✅ 21 primitivos, 6 muertos |

**Costo total: $1.46**, todo del plan OpenCode Go. Cero de saldo Zen. Contraste
con los ~$5 de la corrida anterior que no dejó entregable.

### PRP-008 escrito y aprobado
`.claude/PRPs/PRP-008-dashboard-operativo-y-asignaciones.md` — 6 fases, cada una
con verificación objetiva. Aprobado por el señor Ignacio.

### Fases implementadas

**Fase 1 — Datos y RLS** (migración `051_asignaciones_leads_eventos.sql`, aplicada)
- `lead_asignaciones`: tabla puente con rol owner/colaborador, PK compuesta
  anti-duplicado, autoría y timestamp.
- `eventos_asistentes` **extendida**, no duplicada: ya existía con datos.
- La policy gruesa "creador gestiona asistentes" se partió en cuatro finas.
- Verificado contra producción en transacción revertida: auto-asignarse a cita
  ajena PASA; meter a un tercero BLOQUEADA; autoproclamarse owner SIN EFECTO;
  quitarse a sí mismo PASA.

**Fase 2 — Autoría real + auto-asignación** (migración `052_autoria_real_de_mensajes.sql`, aplicada)
- `integrante_id` como FK real en `mensajes_wa` y `outreach_messages`.
- La autoría la resuelve el SERVIDOR desde la sesión, no el cliente. Antes el
  navegador mandaba `enviado_por: 'Equipo'` hardcodeado.
- `lib/repos/asignaciones.ts` + `lib/types/asignacion.ts`.
- Backfill: 24/24 en outreach desde `aprobado_por`; 1/7 en `mensajes_wa` (los
  marcados "Equipo" quedan sin autor — inventarlo sería peor).

**Fase 3 — Avatares de asignados**
- `components/shared/avatar-stack.tsx`: overflow "+N", owner primero, fallback de
  iniciales sobre el color del integrante, sin handlers (no captura el drag).
- Integrado en `leads-inbox.tsx` — ver "código muerto" más abajo.
- Datos por lote: una consulta para los 541 leads, no una por tarjeta.

## Decisiones del señor Ignacio (son restricciones, no opciones)

| Decisión | Valor |
|---|---|
| **La asignación es AUTOMÁTICA por contacto** | El primero que le escribe a un lead queda `owner`; los siguientes, `colaborador` |
| Vex (bot) | **No asigna**. Un envío sin autor identificable ("Equipo") tampoco |
| Autoría de mensajes | Debe constar el nombre del integrante real, y se asocia a su usuario (FK) |
| Vista equipo del dashboard | **Segmented en la misma página**, no ruta aparte |
| Gráficos | SVG/CSS propio, sin dependencia nueva (resuelto por T-003) |

## El hallazgo que cambió el diseño

T-002 diseñó **asignación manual**. El señor Ignacio preguntó si funcionaba
automáticamente al contactar. La evidencia le dio la razón de forma contundente:

> **541 leads, 0 con `responsable_id`.**

La columna existía desde el esquema inicial y nunca se usó. La asignación manual
ya había fracasado en silencio: nadie entra a marcar "este lead es mío" antes de
escribirle. Construir la tabla puente para llenarla a mano habría repetido el
mismo fracaso con más tablas.

## Errores propios (detalle completo en `log.md`)

1. **Agregar una FK rompió el calendario en producción.** `eventos_asistentes`
   quedó con dos FKs a `dim_integrantes` y el embed de PostgREST se volvió
   ambiguo → 500. Verifiqué la migración pero no su efecto sobre las consultas
   existentes.
2. **Di por bueno trabajo de worker sobre código muerto.** `lead-card.tsx` y
   `leads-pipeline.tsx` no los importa nadie.
3. **Ofrecí una branch de Supabase sin saber que no copia los datos.**

## Estado del repo

Rama `feat/asignaciones-fase-1`, 4 commits, **nada desplegado todavía**:
- `c1d82f0` migración 051
- `44a6ec3` permiso de apply_migration
- `4057a33` fase 2 (autoría + auto-asignación)
- `98c7ca9` fix del 500 + fase 3

`tsc --noEmit` exit 0 · `npm run build` exit 0.

## Pendientes

1. **Abrir el PR** y desplegar — el fix del calendario está sin publicar.
2. **`/settings` no carga para nadie** (preexistente). Descartado: build, columnas,
   RLS, peso de datos, JSON corrupto, deployment. Vercel loguea **200**. Sin error
   en consola según el señor Ignacio. Probar de nuevo tras desplegar el fix del 500.
3. Fases 4-6: UI de calendario, dashboard, y limpieza de `responsable_id`
   (irreversible, requiere aprobación en el momento).
4. Decisiones abiertas del PRP: **D2** (deuda de 24 endpoints que consultan
   Supabase fuera de repos — recomiendo PRP aparte), **D3** (historial de
   transiciones G1, sin él no hay velocidad de pipeline), **D7** (quién ve
   finanzas y jornadas del equipo).

## Infraestructura resuelta esta sesión

- **OpenCode Go activo**: catálogo completo (glm-5.3, kimi-k3, qwen3.8-max,
  deepseek-v4-pro, grok-4.5…). Default de la config cambiado a `opencode-go/glm-5.3`.
- **Modelos alojados en China** habilitados por el señor Ignacio → DeepSeek V4 Pro
  utilizable.
- **Vercel CLI** re-autenticado (el MCP seguía dando 403; la CLI sí funciona).
- **Permiso `apply_migration`** agregado a `.claude/settings.json`.

## Caídos durante la sesión

- **AGY**: cuota individual agotada (reset ~3h).
- **Codex**: refresh token revocado, requiere login interactivo.
- **Copilot CLI**: no instalado.
- **OpenCode Go**: límite de 5 horas alcanzado al final (reset 3h30m).

Ver también: [[protocolo-avengers]] · [[2026-08-17-avengers-dashboard]]
