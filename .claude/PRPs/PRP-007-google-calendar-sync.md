# PRP-007: Integración Google Calendar → Calendario de Equipo CRM

> **Estado**: PENDIENTE
> **Fecha**: 2026-07-06
> **Proyecto**: Tryvex App (tryvex-proyects · Vercel `tryvexplataform`)

---

## Objetivo

Los eventos creados o modificados en el Google Calendar de Tryvex llegan automáticamente al calendario de equipo del CRM (tabla `eventos`), en tiempo casi real vía webhook push (`events.watch`) con sync incremental por `syncToken`, sin intervención manual.

## Por Qué

| Problema | Solución |
|----------|----------|
| Las reuniones agendadas desde la landing (o directo en Google Calendar) no aparecen en el CRM — el equipo mantiene dos calendarios a mano | Sync automático unidireccional Google → CRM: todo evento del calendario Tryvex se refleja en el calendario de equipo |
| Doble ingreso de datos = eventos olvidados y reuniones perdidas | Push notifications de Google gatillan sync incremental en segundos |

**Valor de negocio**: cero doble-digitación; el calendario del CRM se vuelve la fuente única visible para el equipo. Las reuniones creadas por leads desde la landing (`createCalendarEvent` de tryvex-landing) entran solas al pipeline de visibilidad.

## Qué

### Criterios de Éxito
- [ ] Crear un evento en Google Calendar → aparece en el calendario del CRM en < 1 minuto (webhook) sin refrescar manualmente la integración
- [ ] Editar título/horario en Google → el evento del CRM se actualiza (upsert por `google_event_id`, sin duplicados)
- [ ] Borrar/cancelar en Google → el evento desaparece del CRM
- [ ] El canal de watch se renueva solo vía Vercel cron antes de expirar (sin intervención manual por ≥ 2 semanas)
- [ ] `syncToken` inválido (410 GONE) → full resync automático sin duplicar eventos
- [ ] Eventos creados desde el CRM (`origen = 'crm'`) no se ven afectados por el sync
- [ ] `npm run build` exitoso + deploy en `tryvexplataform` con env vars configuradas

### Comportamiento Esperado (Happy Path)

1. Un lead agenda una llamada desde la landing → tryvex-landing crea el evento en Google Calendar (código existente, no se toca).
2. Google envía push notification al webhook del CRM (`POST /api/webhook/google-calendar`) con headers `X-Goog-Channel-Id` / `X-Goog-Resource-State`.
3. El webhook valida el channel token, ejecuta `events.list` incremental con el `syncToken` guardado.
4. Cada evento retornado se upsertea en `eventos` por `google_event_id` (status `cancelled` → delete). Eventos nuevos quedan con `origen = 'google'`, `creado_por = null`, tipo mapeado por heurística (`Llamada Tryvex ·` → `reunion_lead`, resto → `otro`).
5. El nuevo `nextSyncToken` se persiste. El equipo ve el evento en `/calendario` de inmediato.
6. Cada día, un Vercel cron (`/api/cron/google-watch`) verifica la expiración del canal y lo renueva si quedan < 48 h.

---

## Contexto

### Referencias — código existente

| Archivo | Rol |
|---------|-----|
| `app/api/eventos/route.ts` | Endpoint eventos existente (GET rango / POST) — patrón API response `{ success, data }` |
| `lib/repos/eventos.ts` | `EventosRepository` — extender con `upsertFromGoogle`, `deleteByGoogleId` |
| `lib/types/evento.ts` | `Evento`, `EventoInsertSchema` (Zod) — extender tipo con `google_event_id`, `origen` |
| `app/api/webhook/scraper/route.ts` | **Patrón webhook a replicar**: valida secret por header, usa `createClient` de `@supabase/supabase-js` con `SUPABASE_SERVICE_ROLE_KEY` (sin sesión de usuario) |
| `proxy.ts` | Matcher ya excluye `api/webhook` del auth — agregar exclusión `api/cron` |
| `C:\Users\w10\Documents\GitHub\Tryvex Landing\src\lib\google-calendar.ts` | **Patrón OAuth a portar**: `google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, "https://developers.google.com/oauthplayground")` + `setCredentials({ refresh_token })`, TZ `America/Santiago` |

### Credenciales (reutilizar de tryvex-landing — ya existen, NO regenerar)

`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` · `GOOGLE_CALENDAR_ID`
Nuevas: `GOOGLE_WEBHOOK_TOKEN` (valida push), `CRON_SECRET` (valida cron de Vercel).
Todas se agregan al proyecto Vercel `tryvexplataform` — nunca hardcodeadas.

### Arquitectura Propuesta

```
lib/
├── google/
│   ├── auth.ts            — getAuth() portado de tryvex-landing
│   ├── calendar-sync.ts   — syncIncremental() / fullResync() / mapGoogleEvent()
│   └── watch.ts           — registerWatch() / stopWatch() / needsRenewal()
├── repos/
│   ├── eventos.ts         — + upsertFromGoogle(), deleteByGoogleId()
│   └── google-sync.ts     — GoogleSyncRepository (estado: syncToken, canal)
└── types/
    └── evento.ts          — + google_event_id, origen

app/api/
├── webhook/google-calendar/route.ts   — POST push de Google (service role, sin auth de usuario)
└── cron/google-watch/route.ts         — GET renovación de canal (valida CRON_SECRET)

vercel.json                            — crons: [{ path: /api/cron/google-watch, schedule: "0 6 * * *" }]
```

Dependencia nueva: `googleapis` (misma que usa tryvex-landing).

### Modelo de Datos

```sql
-- Extensión de eventos (idempotencia del sync)
ALTER TABLE eventos
  ADD COLUMN google_event_id TEXT UNIQUE,
  ADD COLUMN origen TEXT NOT NULL DEFAULT 'crm' CHECK (origen IN ('crm', 'google'));

-- Estado del sync (fila única)
CREATE TABLE google_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id TEXT NOT NULL UNIQUE,
  sync_token TEXT,
  channel_id TEXT,
  resource_id TEXT,
  channel_expiration TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Mapeo Google → Evento CRM

| Google | eventos |
|--------|---------|
| `id` | `google_event_id` |
| `summary` | `titulo` (fallback "(Sin título)") |
| `start.dateTime` / `end.dateTime` | `inicio` / `fin` (eventos all-day `start.date` → skip o mapear 09:00–18:00, decidir en fase) |
| `description` | `notas` |
| `summary` empieza con "Llamada Tryvex" → `reunion_lead`; else | `tipo = 'otro'` |
| `status === 'cancelled'` | DELETE por `google_event_id` |
| — | `origen = 'google'`, `creado_por = null`, sin asistentes (v1) |

---

## Blueprint (Assembly Line)

> Solo FASES. Las subtareas se generan al entrar a cada fase con `/bucle-agentico`.

### Fase 1: Migración DB + Types
**Objetivo**: `eventos` con `google_event_id`/`origen` + tabla `google_sync_state` creadas en Supabase (proyecto wfsjzhshkaokjoansbhc); tipos TS actualizados en `lib/types/evento.ts`.
**Validación**: migración aplicada sin error; `npm run build` pasa; el calendario existente sigue funcionando (GET /api/eventos).

### Fase 2: Cliente Google + Core de Sync
**Objetivo**: `lib/google/` (auth portado de landing, `syncIncremental` con syncToken + manejo de 410 → full resync, mapper) + repos `google-sync.ts` y extensión de `eventos.ts` (upsert/delete por google_event_id).
**Validación**: script/endpoint temporal ejecuta un full sync contra el calendario real y los eventos aparecen en la tabla `eventos` sin duplicados al correrlo dos veces.

### Fase 3: Webhook Push + Registro de Watch
**Objetivo**: `POST /api/webhook/google-calendar` (valida `X-Goog-Channel-Token` contra `GOOGLE_WEBHOOK_TOKEN`, service role, dispara sync incremental, siempre responde 200 rápido) + `lib/google/watch.ts` con registro de canal apuntando a la URL de producción.
**Validación**: canal registrado contra la URL de `tryvexplataform`; crear evento en Google Calendar → aparece en el CRM sin acción manual.

### Fase 4: Cron de Renovación + Deploy
**Objetivo**: `GET /api/cron/google-watch` (valida `CRON_SECRET`, renueva canal si expira en < 48 h, re-registra si no existe) + `vercel.json` con cron diario + exclusión `api/cron` en `proxy.ts` + env vars cargadas en Vercel.
**Validación**: deploy exitoso en `tryvexplataform`; invocar el cron con el secret retorna 200 y `google_sync_state.channel_expiration` se actualiza; sin secret retorna 401.

### Fase 5: Validación Final End-to-End
**Objetivo**: Sistema funcionando end-to-end en producción.
**Validación**:
- [ ] `npm run build` exitoso
- [ ] Crear/editar/cancelar evento en Google → CRM refleja cada caso (screenshot Playwright de `/calendario`)
- [ ] Correr sync dos veces no duplica eventos
- [ ] Criterios de éxito del PRP cumplidos

---

## Aprendizajes (Auto-Blindaje)

> Esta sección CRECE con cada error encontrado durante la implementación.
> El mismo error NUNCA ocurre dos veces.

*(vacío — se llena durante la implementación)*

---

## Gotchas

- [ ] `events.watch` requiere URL HTTPS pública verificada — no funciona en localhost; probar push solo contra el deploy de Vercel (en dev, usar sync manual)
- [ ] Canales de watch expiran (TTL por defecto ~7 días para events) — la renovación por cron es obligatoria, no opcional
- [ ] Google puede enviar notificaciones `sync` (estado inicial del canal) — responder 200 sin ejecutar sync
- [ ] `syncToken` expira → API retorna 410 GONE → hay que descartar el token y hacer full resync con ventana `timeMin`
- [ ] Webhook debe responder rápido (< 10 s) o Google reintenta — no bloquear con trabajo pesado innecesario
- [ ] Eventos all-day usan `start.date` (no `dateTime`) — definir tratamiento en Fase 2 antes de mapear
- [ ] `EventoInsertSchema` exige `fin > inicio` — eventos de Google con duración 0 deben ajustarse o saltarse
- [ ] `proxy.ts` matcher: `api/webhook` ya está excluido, pero `api/cron` NO — agregar antes del deploy o el cron recibirá redirect a login
- [ ] Zona horaria: seguir el patrón de tryvex-landing (`America/Santiago`, cuidado con DST Chile) — los `dateTime` de Google ya traen offset, guardar como ISO con offset (compatible con `z.string().datetime({ offset: true })`)
- [ ] Vercel cron en plan hobby: mínimo 1 ejecución/día — el schedule diario es suficiente si el TTL del canal es 7 días

## Anti-Patrones

- NO crear queries a Supabase fuera de `lib/repos/` (regla dura del proyecto)
- NO regenerar credenciales OAuth — reutilizar las de tryvex-landing tal cual
- NO hacer sync bidireccional en esta iteración (solo Google → CRM); `origen` deja la puerta abierta
- NO hardcodear calendar_id, tokens ni URLs — todo por env vars
- NO duplicar el patrón webhook — replicar el de `app/api/webhook/scraper/route.ts`
- NO asumir APIs de Next.js 16 por memoria — leer `node_modules/next/dist/docs/` (route handlers, `params` como Promise)

---

*PRP pendiente aprobación. No se ha modificado código.*
