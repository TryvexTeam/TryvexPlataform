# Estado del proyecto y migración de repositorio — 2026-07-08

> Documento de handoff. A partir de ahora **todo el trabajo se hace en este repo**:
> `C:\Users\w10\Documents\GitHub\TryvexPlataform` → `TryvexTeam/TryvexPlataform` (GitHub).
> El repo viejo `C:\Users\w10\Documents\GitHub\tryvex-proyects` (remoto `Dela07/tryvex-proyects`) queda **deprecado** — era la fuente del error de "mandar donde no es".

---

## 1. Mapa de repositorios (el origen del problema)

| Repo | Remoto | Rol | Estado |
|------|--------|-----|--------|
| `Documents\GitHub\tryvex-proyects` | `origin` = Dela07/tryvex-proyects · `tryvex` = TryvexTeam/TryvexPlataform | Repo viejo, doble remoto | **DEPRECADO** |
| `Documents\GitHub\TryvexPlataform` | `origin` = TryvexTeam/TryvexPlataform | **Repo oficial del equipo** | ACTIVO |

- Rama principal del team: `main`.
- En el repo viejo la rama de trabajo era `Lanidn`; su contenido ya está en `main` del team (hasta `d53689e`).
- Los pushes a Dela07 fallaban/colgaban por el selector de cuentas de Windows (Git Credential Manager con múltiples cuentas). Con este repo eso desaparece: un solo remoto.

## 2. Ramas y PRs

| Rama (en TryvexTeam) | Contenido | Estado |
|---|---|---|
| `main` (`69ee63b`) | Todo lo anterior + PR #2 | Producción *pendiente de deploy* (ver §5) |
| `fix/tareas-500-created-by` | Fix 500 tareas + dispo por color + visibilidad tema minimalista | **Mergeada** (PR #2) |
| `feature/horario-extendido-2am` (`e3e1c11`) | Horario 10:00–02:00 + responsables en tareas + dispo estilo GCal | **Pendiente de PR/merge**: https://github.com/TryvexTeam/TryvexPlataform/compare/main...feature/horario-extendido-2am |

Convención acordada: commits de features con autor **Ignvvcio254** (`Ignvvcio254@users.noreply.github.com`), el señor Ignacio aprueba los PRs desde la cuenta TryvexTeam. Nunca push directo a `main`.

## 3. Qué se implementó (ya mergeado en main)

### 3.1 Disponibilidad por color de integrante (calendario del equipo)
- `lib/utils/lead-utils.ts` → `MEMBER_PALETTE` (8 colores vívidos). Color estable por **índice** del integrante en la respuesta de `/api/disponibilidad` (fallback `hashColorHex`).
- `components/equipo/calendario-semana.tsx` → capa de disponibilidad identifica QUIÉN está disponible, leyenda con chips nombre+color, marcador "todos disponibles", chips de asistentes unificados.
- Opacidades subidas para que se vea en el **tema minimalista** (fondo negro puro, glow off — definido en `components/dashboard/theme-context.tsx`).

### 3.2 Fix error 500 al crear tarea (PR #2)
- **Causa raíz**: `tareas.created_by` es FK a `dim_integrantes.id`, pero `POST /api/tareas` insertaba el **auth user id** crudo → violación FK (409 PostgREST) → excepción sin manejar → 500. Fallaba para todos.
- Fix: `TareasRepository.integranteIdDe(authUserId)` (mismo patrón que `eventos`/`disponibilidad`) + try/catch en la ruta con mensaje real.

## 4. Qué está en la rama `feature/horario-extendido-2am` (pendiente de merge)

1. **Horario 10:00 → 02:00** en calendario semanal (`calendario-semana.tsx`):
   - `HORA_MIN = 10`, `HORA_MAX = 26`; filas 24-25 = 0:00-1:00 de la madrugada.
   - Helpers `horaExtendida()` / `diaExtendido()`: la madrugada vive en la **columna del día anterior** (eventos, línea de "ahora", drag, creación). Al crear un evento con hora < 2:00 se guarda con fecha del día siguiente.
   - `celdaKey(dayIdx, h)`: filas ≥24 mapean a `(día+1, hora−24)` para la dispo.
2. **Mi horario** (`disponibilidad-grid.tsx`): mismo rango 10–02; filas de madrugada se **guardan como hora 0-1 del día siguiente**. Colores unificados con `MEMBER_PALETTE`.
3. **Dispo estilo Google Calendar**: líneas verticales de 4px de color por integrante en el margen izquierdo de cada slot (reemplaza las bandas de fondo).
4. **Asignación de responsables en tareas**:
   - `TareaInsertSchema` + `responsables_ids` (no es columna de `tareas`; se persiste en `tarea_responsables` vía `setResponsables`).
   - `POST /api/tareas` y `PATCH /api/tareas/[id]` separan `responsables_ids` del resto antes del insert/update.
   - `tarea-form.tsx`: selector de responsables con chips de color (fuente: `/api/disponibilidad`).

## 5. ⚠️ Deploy — Vercel NO tiene integración Git con este repo

- Proyecto Vercel: **tryvexplataform**, team **tryvex1** (`team_hU5cYqnmyksABpH8zNRqecAm`, projectId `prj_VpnT3ZoroV9SqlCRnrDHVbzarcEi` — está en `.vercel/project.json` del repo viejo; copiar a este repo si no existe).
- **Mergear a `main` NO despliega** — el commit `69ee63b` mergeado no tiene ni statuses ni check-runs de Vercel. Por eso el 500 de tareas siguió apareciendo en producción después del merge.
- Opciones (pendiente de decisión del señor Ignacio):
  1. Conectar Git: Vercel → proyecto `tryvexplataform` → Settings → Git → conectar `TryvexTeam/TryvexPlataform` (recomendado; los merges a main despliegan solos).
  2. Deploy manual: `vercel deploy --prod --scope tryvex1` (CLI instalada globalmente, sesión activa como `tryvex-agency`).
- El MCP de Vercel **no tiene scope** al team tryvex1 (solo a la cuenta personal ignvvcio254) — usar CLI o dashboard.

## 6. Cambios aplicados directo en Supabase (ya vivos, NO requieren deploy)

DB: proyecto `wfsjzhshkaokjoansbhc`.

| Cambio | Motivo |
|---|---|
| INSERT `dim_integrantes`: **Cristian De La Fuente** (`cristian.delafuente2002@gmail.com`, auth `7107d818-…`, id `a73d6cff-…`) | Sus llamadas daban 406 (`.single()` sin fila); ya guarda disponibilidad OK |
| INSERT `dim_integrantes`: **Joseph Maillens** (`josephmaillens@gmail.com`, auth `9c93a88a-…`, id `6cf4ddc6-…`) | Tercer usuario registrado sin fila de integrante (406s en logs) |

**Regla operativa detectada**: cada usuario nuevo que se registra en auth necesita su fila en `dim_integrantes` (con `auth_user_id` y `activo=true`) o los flujos de dispo/eventos/tareas fallan. Candidato a automatizar con un trigger en `auth.users` o en el signup.

## 7. Equipo (estado actual en DB)

| Integrante | Email | activo |
|---|---|---|
| Ignacio Navarrete | ignacio.andres.navarrete.silva@gmail.com | ✅ |
| Cristian De La Fuente | cristian.delafuente2002@gmail.com | ✅ |
| Joseph Maillens | josephmaillens@gmail.com | ✅ |

## 8. Pendientes

- [ ] Crear/aprobar PR de `feature/horario-extendido-2am` → main.
- [ ] Conectar integración Git de Vercel con TryvexTeam/TryvexPlataform (o acordar deploy manual post-merge).
- [ ] **Desplegar a producción** — el fix del 500 de tareas está en main pero AÚN NO en prod.
- [ ] Verificar en prod: crear tarea (sin 500), asignar responsables, calendario 10–02, dispo por colores en tema minimalista.
- [ ] (Opcional) Trigger/automación para crear `dim_integrantes` al registrarse un usuario.
- [ ] Retirar el repo viejo `tryvex-proyects` local para evitar confusiones (o al menos quitarle el remoto `origin` de Dela07).
