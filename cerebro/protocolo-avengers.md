# Protocolo "LOS AVENGERS" — orquestación multi-CLI recursiva

> Nombrado por el señor Ignacio el 2026-08-17, durante la primera corrida real
> (dashboard operativo: inventario de KPIs + arquitectura de asignación).
> Metodología, no herramienta. Aplica a cualquier trabajo a escala en este repo.

## Qué es

Jarvis orquesta modelos que **no son suyos**: Claude Opus 4.6 corriendo dentro del
CLI de Google (AGY/Antigravity), Claude Opus 5 entrando por OpenCode con plan Zen.
Proveedores distintos, procedencias distintas, un solo objetivo sobre el mismo repo.

No es un enjambre de clones. Es un reparto: cada uno con su fortaleza.

## La propiedad que lo distingue: recursión

Los workers **crean sus propios subagentes**. No es teoría — verificado el
2026-08-17: AGY se armó 4 investigadores en paralelo (Schema and Types Researcher,
Repos Researcher ×2, API and Dashboard Researcher), los hizo leer simultáneamente,
recibió sus reportes por `send_message` y los cerró al terminar la recolección.

Jarvis despachó 2 workers; en el pico había **7 cabezas leyendo el código**.

> El multiplicador no es orquestar modelos. Es orquestar orquestadores.

## La letra chica (lo que hace que funcione)

En la película los Avengers ganan por heroísmo individual. Acá es al revés: lo
que evita la Torre de Babel es lo aburrido.

1. **Spec numerada = contrato auditable.** Puntos 1..N. Al recibir la entrega, cada
   punto se mapea a evidencia por grep. Punto sin evidencia = brecha.
2. **Un dueño por archivo.** Paralelismo solo con partición real.
3. **Veredicto objetivo, nunca un claim.** `exit=0` no basta: check de entregable.
4. **Prohibido inventar.** La spec exige escribir `NO VERIFICADO` en vez de suponer.
   Un dato inventado invalida la entrega entera.
5. **One-shot.** Brecha no-mínima → re-derivar con spec corregida en conversación
   FRESCA. No parchar contexto contaminado.

## Reparto por fortaleza

| Worker | Modelo | Para qué |
|---|---|---|
| AGY (`agy.exe`) | Claude Opus 4.6 (Thinking), en `~/.gemini/antigravity-cli/settings.json` | Lectura exhaustiva y barridas. Crea subagentes propios |
| OpenCode | `-m opencode/claude-opus-5` (Zen) | Razonamiento denso sobre poco código: esquema, RLS, arquitectura |
| Jarvis | — | Despacho, verificación punto-por-punto, síntesis. Nunca delega el veredicto |

## Cómo lanzarlo dentro de Orca (para que el humano lo vea)

Lanzar con `wt` deja los procesos **invisibles** para Orca: nacen como hermanos
del IDE, no hijos. `orca terminal list` no los muestra y no se pueden inspeccionar.

Secuencia correcta:

```bash
orca orchestration run-create --objective "<objetivo>" --json
orca orchestration task-create --spec "$(cat workspace/tasks/T-XXX.md)" --json
orca terminal create --json                       # devuelve handle
orca terminal rename --terminal <handle> --title "T-XXX <CLI> · <objetivo>" --json
orca orchestration dispatch --task <task_id> --to <handle> --json   # tracking
orca terminal send --terminal <handle> --text 'pwsh -File ...runner-T-XXX.ps1' --enter --json
```

**AGY no está en el catálogo de agentes de Orca** (claude, codex, opencode, gemini,
droid, grok, cursor), así que `worker-start --agent agy` no existe. Pero eso NO lo
deja fuera de Orca — ver la sección siguiente.

## Control de TUI: cualquier CLI es orquestable (verificado 2026-08-18)

La guía de Orca lo dice explícitamente: *"If the target is a bare shell, omit
`--inject`… then send the prompt manually with `orca terminal send`"*. Las
primitivas `terminal create/send/wait/read` sirven para **cualquier** agente,
esté o no en el catálogo.

Secuencia verificada con la TUI de AGY (escribió el archivo pedido a la primera):

```bash
orca terminal create --json                                    # → handle
orca terminal rename --terminal <handle> --title "AGY TUI" --json
orca terminal send --terminal <handle> --text "agy" --enter --json    # abre la TUI
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 45000 --json
orca terminal send --terminal <handle> --text "<orden>" --enter --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 90000 --json
orca terminal read --terminal <handle> --limit 20 --json       # leer respuesta
```

**Esto invalida un gotcha del skill `multi-cli`:** ahí dice que `agy -c -p` está
roto en headless y por eso *"no usarlo para continuar tareas; usar conversación
nueva (el costo es releer)"*. Con la TUI eso ya no aplica — se le mandan mensajes
sucesivos a la MISMA sesión con su contexto vivo. **Corregir un detalle ya no
cuesta una relectura completa del contexto.**

Aplica igual a OpenCode y a cualquier CLI futuro: si tiene TUI, es orquestable.

### Gotcha: `input_accepted` NO significa que el worker esté trabajando

`worker-start` puede devolver `stage: "input_accepted"` y `state: "ready"` mientras
la TUI sigue en su pantalla de bienvenida: Orca aceptó el envío, pero el prompt se
perdió entre el arranque de la interfaz y la entrega (pasó con un spec de ~5 KB).

**Siempre verificar el efecto, no el receipt:** `worker-read --dispatch <id>` y mirar
el tail. Si se ve el splash ("Ask anything…") en vez del prompt, reenviar con
`terminal send`. Señal de que SÍ está trabajando: el indicador `■⬝⬝⬝⬝ esc interrupt`
y el contador de contexto/gasto moviéndose.

Corolario: un worker arrancado así **no recibió el preámbulo de lifecycle**, por lo
que no emitirá `worker_done`. Vigilar el entregable directamente.

## OpenCode SÍ va por orquestación Orca pura (desde 2026-08-18)

El obstáculo era que `--model` solo acepta ids de Claude/Codex/Cursor, así que
`--agent opencode` arrancaba con el default (gemma). **Se resuelve fijando el
default en la config**, no en la línea de comando:

```jsonc
// ~/.config/opencode/opencode.jsonc
"permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" },
"model": "opencode/claude-opus-5",
```

Con eso, el worker arranca en Opus 5 **y** puede escribir:

```bash
orca orchestration worker-start --task <task_id> --worktree current --agent opencode --json
orca orchestration worker-show --dispatch <dispatch_id> --json
orca orchestration worker-read --dispatch <dispatch_id> --limit 40 --json
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json
```

Gotcha: una Task que quedó en `dispatched` por un intento fallido **no se puede
relanzar** (`task_not_startable`). Devolverla primero con
`task-update --id <task_id> --status ready`.

## Auto-blindaje — errores reales y su fix

| Error (2026-08-17) | Causa | Fix permanente |
|---|---|---|
| Workers analizaron código **87 commits viejo** | No se hizo `git pull` antes de despachar | **`git fetch` + comparar contra `origin/main` ANTES de escribir specs.** Si hay drift en los archivos que el worker debe mapear, actualizar y recién ahí despachar |
| Entregable "existente" de una corrida muerta iba a pasar el check | El check es `Test-Path`; el archivo viejo seguía ahí | **Borrar/apartar entregables previos antes de relanzar.** Un `Test-Path` sobre un archivo rancio es un falso positivo |
| `tsc` daba exit 2 tras el pull | `.next/` (2 GB) con artefactos rancios apuntando a rutas movidas | **`rm -rf .next` antes de typecheckear tras un pull grande.** Los errores en `.next/types/validator.ts` no son código fuente |
| OpenCode: `✗ Write failed — Tool execution aborted` | **NO era el tamaño.** En headless (`opencode run`) no hay TTY para aprobar el uso de herramientas: la peticion de permiso se cuelga y termina abortada. Falla igual con 40 KB que con 4 letras | **Config global `~/.config/opencode/opencode.jsonc`:** `"permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" }`. Verificado 2026-08-18: antes 3 intentos fallidos con 2 modelos → despues `Wrote file successfully` |

## Auto-blindaje — corrida del 2026-08-18 (6/6 aceptadas, $1.46)

| Error | Causa | Fix permanente |
|---|---|---|
| El worker implementó UI sobre **código muerto** (`lead-card.tsx`, `leads-pipeline.tsx`: nadie los importa) | El spec nombró archivos "de leads" sin verificar cuál se renderiza | **Antes de despachar UI, verificar quién importa el componente**: `grep -rn 'NombreComp' --include=*.tsx \| grep -v su-propio-archivo`. Sin importadores = código muerto. Va EN el spec |
| Worker se quedó a mitad por límite de cuota | OpenCode Go tiene tope de 5 horas | No es fallo del worker. Revisar lo hecho y **terminarlo Jarvis**: suele faltar poco y re-despachar cuesta más |
| Qwen3.8-Max encolaba sin procesar; el primer mensaje se perdía | La TUI de OpenCode **descarta el primer mensaje** tras arrancar o tras cambiar de modelo | **Siempre reenviar el prompt** y confirmar con el contador de contexto moviéndose, no con el receipt |
| `/models` y las rutas de los prompts llegaban transformadas a la TUI | Git Bash convierte rutas tipo `/models` y `workspace/tasks/...` (MSYS path mangling) | `export MSYS_NO_PATHCONV=1` antes de cualquier `orca terminal send` |
| DeepSeek V4 Pro respondía "only available hosted in China" | Requiere opt-in explícito en el panel de OpenCode | Es interactivo: lo activa el señor Ignacio en `opencode.ai/workspace/<id>/go` |
| Ctrl+C no salía de la TUI de OpenCode | Solo interrumpe la generación | Para cambiar de modelo: `/models` dentro de la TUI (con `MSYS_NO_PATHCONV=1`), o terminal nueva |

**Modelos verificados produciendo (2026-08-18):** `opencode-go/glm-5.3`,
`opencode-go/kimi-k3`, `opencode-go/deepseek-v4-pro`. Qwen3.8-Max no procesó.

**Subagentes propios de Jarvis (Sonnet effort bajo) para inventarios mecánicos:**
excelente relación costo/resultado en tareas de grep exhaustivo con spec cerrada
(T-005 y T-006 salieron impecables). Usarlos en vez de un worker externo cuando la
tarea es "contar y listar lo que ya existe".

## Resultado de la primera corrida (2026-08-17)

- **T-001 (AGY)** ACEPTADA: 38 KB, 28 tablas inventariadas, 38 KPIs con fórmula
  real, 11 gaps. Ver `workspace/results/T-001-inventario-datos.md`.
- **T-002 (OpenCode)** falló la escritura tras mapear todo el contexto; reparada
  con `run -c`.

Hallazgo transversal: buena parte de lo que se iba a construir **ya existe a medias**
(`fact_leads.responsable_id`, `tarea_responsables`, `eventos_asistentes`). El trabajo
es de reconciliación, no de creación. Eso solo se supo tras el pull.

Ver también: [[estado-plataforma]] · [[contexto-tryvex]] · [[gotchas-supabase]]
