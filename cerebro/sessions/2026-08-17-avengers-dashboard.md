# 2026-08-17/18 — LOS AVENGERS + dashboard operativo (dónde quedamos)

> Sesión larga. Dos frentes: (A) montar la metodología de orquestación multi-CLI,
> (B) recopilar insumos para rehacer el dashboard. El frente A quedó cerrado y
> documentado; el frente B quedó a mitad.

## Objetivo original del señor Ignacio

Rehacer la sección **dashboard** (hoy inútil) para que sea operativa, con UI/UX
inmersiva y 100% responsive (uso desde celular). Para eso hacían falta dos insumos,
a recopilar en paralelo por workers externos:

1. **Barrida de datos para KPIs** — qué captura la plataforma que sirva para métricas
   (jornada, disponibilidad, leads contactados, tareas avanzadas, citas, etc.).
2. **Propuesta de asignación de contactos a integrantes** — leads y citas asociados a
   una persona del equipo, FE + BE.

### Directivas decididas (son restricciones, no opciones)

| Decisión | Valor |
|---|---|
| Alcance del dashboard | **Ambas vistas**: personal ("lo mío") + equipo, apoyado en `lib/repos/permisos.ts` |
| Modelo de asignación de leads | **Multi-asignación con tabla puente** + rol (owner/colaborador). NO columna simple |
| Citas del calendario | **Cualquiera asigna al crear + el integrante puede auto-asignarse** (los dos caminos) |
| Entregable de esta ronda | Solo análisis y propuesta. Implementar recién tras aprobar el PRP |
| UI de leads | Avatar del integrante abajo a la derecha de la tarjeta, replicando el patrón de tareas (pulido a stack + "+N") |

## Estado de las tareas

| Tarea | Worker | Estado |
|---|---|---|
| **T-001** inventario de datos KPI | AGY + Opus 4.6 | ✅ **ACEPTADA** — `workspace/results/T-001-inventario-datos.md` (38 KB). 11/11 puntos verificados por grep |
| **T-002** propuesta de asignación | OpenCode | ❌ **SIN ENTREGABLE** tras 3 intentos. Ver "Qué falta" |

`workspace/results/OBSOLETO-pre-pull-T-001.md` es de la corrida pre-pull: **ignorar**.

### Hallazgos de T-001 (insumo clave para el dashboard)

- **28 tablas** inventariadas, **38 KPIs** con fórmula sobre columnas reales, **11 gaps**.
- `interacciones_lead` es el dato más rico y **subutilizado**: ya trae `integrante_id`,
  `lead_id`, `tipo`, `respondio`, `created_at` → 5+ KPIs de productividad comercial.
- **Gap más caro:** no hay historial de transiciones de estado (leads, clientes,
  proyectos) — solo el estado actual. Sin eso, tiempo por etapa, conversión real y
  velocidad de pipeline son incalculables.
- Ya existen vistas pre-agregadas listas para consumir: `jornadas_resumen` y
  `finanzas_resumen_mensual`.
- Dashboard actual: 4 contadores + lista de 20 leads. **No consulta** jornadas,
  finanzas, eventos, interacciones, WA, llamadas ni actividad.

### Hallazgo transversal (cambia el enfoque del trabajo)

**Mucho de lo que se iba a construir ya existe a medias:**

- `fact_leads.responsable_id` → la asignación de leads **ya existe**, en modo dueño
  único. Es migrar single → multi + backfill, no crear de cero.
- `tarea_responsables` (`{tarea_id, integrante_id}`) → tabla puente **sin columna de
  rol**. Es el patrón a replicar; el rol owner/colaborador sería nuevo.
- **`eventos_asistentes` ya existe** (`lib/repos/eventos.ts:83`) → las citas ya
  soportan varios integrantes. Falta la UI de auto-asignación y el permiso.
- `dim_integrantes` ya trae `color`, `avatar_url`, `horario`; el calendario ya pinta
  bandas de color por integrante.

> El trabajo del dashboard es de **reconciliación**, no de creación.

## Qué falta (retomar por aquí)

1. **Cerrar T-002.** Decisión pendiente del señor Ignacio entre tres vías:
   - **OpenCode + `nvidia/z-ai/glm-5.2`** — $0, verificado funcionando. *Recomendada*
     por criterio de consumo: la tarea es diseño, no código fino.
   - **Codex** — instalado y autenticado, sin estrenar. Orca lo soporta nativo.
   - **Que lo redacte Jarvis** — el mapeo del repo ya está hecho.
2. **Sintetizar el PRP** con T-001 + T-002 → plan del dashboard por fases.
3. **Diseñar la UI/UX inmersiva y responsive** — se dejó a propósito para después de
   saber qué KPIs existen de verdad.

## Pendientes de infraestructura (los debe hacer el señor Ignacio, son interactivos)

Contrató **OpenCode Go** (2026-08-18) para usar modelos chinos baratos, pero el CLI
todavía no lo toma:

1. Activar el toggle **"Activar modelos alojados en China"** en el panel de OpenCode.
2. `opencode auth login` → **OpenCode**, para que tome la suscripción Go (la key en
   `~/.local/share/opencode/auth.json` es del plan viejo; reiniciar el proceso NO
   sirve, cada `run` reusa la misma key).
3. `opencode auth login` → **GitHub Copilot**, cuyo token está con `expires: 0` y por
   eso no aparece en `opencode models`.

Catálogo Go visible: `kimi-k3`, `kimi-k2.7-code`, `glm-5.2`, `qwen3.6-plus`,
`minimax-m3`, `deepseek-v4-pro`.

## Estado técnico del repo

- Rama `docs/cerebro-completo`, **sincronizada con `origin/main`** en `a4921f0`
  (se trajeron 87 commits durante la sesión). Árbol limpio.
- `npx tsc --noEmit` → **exit 0** tras `rm -rf .next`. Veredicto sellado.
- `workspace/` está en `.gitignore`.
- Config de OpenCode arreglada (`~/.config/opencode/opencode.jsonc`): permisos de
  escritura + `model` por defecto. Respaldo en `.jsonc.bak`.

## Outputs de la sesión

| Artefacto | Dónde |
|---|---|
| Protocolo LOS AVENGERS | `cerebro/protocolo-avengers.md` (nodo propio, 154 líneas) |
| Skill `/avengers` | `~/.claude/skills/avengers/SKILL.md` |
| Directiva de consumo | memoria `criterio-de-consumo.md` |
| Inventario de KPIs | `workspace/results/T-001-inventario-datos.md` |

## Costo y lección

Se gastaron **~$5** del saldo OpenCode Zen sin obtener entregable: se despachó Opus 5
(el modelo más caro) a una tarea de análisis y se le hizo releer el codebase 3 veces
por reintentos **sin diagnosticar la causa real primero** (era un permiso sin TTY, no
el tamaño del archivo). De ahí salió la directiva permanente de criterio de consumo.

Ver también: [[protocolo-avengers]] · [[estado-plataforma]] · [[contexto-tryvex]]
