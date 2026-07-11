# Vex (scraper-clientes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agente conversacional "Vex (scraper-clientes)" dentro de TryvexPlataform: gestiona la cartera de leads, genera mensajes personalizados (copy PAS) y envía WhatsApp vía Cloud API con aprobación humana. Incluye migrar los 308 leads del Supabase viejo.

**Architecture:** Port del trybot de `leads-dashboard` (Desktop\leads-dashboard, Railway caído) como feature nativa: services en `lib/vex/`, API routes en `app/api/vex/`, UI en `app/(app)/vex/`. BD única: `tryvex-migracion` (kmqozwcwttafvwhqlhkq). Spec: `docs/superpowers/specs/2026-07-11-vex-agente-design.md`.

**Tech Stack:** Next.js 16 (App Router — ⚠️ leer `node_modules/next/dist/docs/` ante dudas, ver AGENTS.md), TypeScript estricto, Supabase (`@/lib/supabase/server` → `createClient()` con sesión), Zod v4, Groq SDK (`llama-3.3-70b-versatile`), vitest (nuevo), shadcn/ui new-york.

## Global Constraints

- **Rama:** todo en `feat/vex-agente`. NUNCA commitear a `main`. Commits en español explicando el porqué (el equipo los lee).
- **Auth:** toda API route empieza con el patrón de `app/api/leads/route.ts`: `createClient()` → `auth.getUser()` → 401 si no hay user.
- **Estados de lead del CRM** (fuente: migración 000 + revisar `003_leads_won_lost.sql` antes de usar): `sin_contactar | contactado | interesado | reunion_agendada | cerrado | descartado`.
- **Columnas de `fact_leads` del CRM:** `id UUID, nombre_negocio, telefono, info_texto, redes_sociales JSONB, tiene_web, url_web, nicho, localidad, score INTEGER 0-100, estado, responsable_id, origen, ultimo_contacto, notas, created_at, updated_at`. (El dashboard viejo usaba `nombre/comuna/redes TEXT/estado='nuevo'/id numérico` — SIEMPRE mapear.)
- **Envíos:** requieren `confirmar: true` en el body. El primer contacto en frío SOLO por plantilla Meta aprobada. Sin plantilla configurada → fallback link `wa.me`.
- **Cada task termina con:** `npx tsc --noEmit` y `npm run build` verdes (además de sus tests).
- Envío real de prueba: SOLO al número de Cristian, nunca a un lead.

---

### Task 1: Setup — dependencias y vitest

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: comando `npm test` (vitest run), deps `groq-sdk` y `vitest` disponibles.

- [ ] **Step 1: Instalar dependencias**

```bash
npm install groq-sdk
npm install -D vitest
```

- [ ] **Step 2: Agregar script de test a package.json**

En `"scripts"` agregar: `"test": "vitest run"`.

- [ ] **Step 3: Crear vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
```

- [ ] **Step 4: Verificar que corre (0 tests es OK)**

Run: `npm test`
Expected: "No test files found" o suite vacía, exit sin crash. `npm run build` sigue verde.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: vitest + groq-sdk para la feature Vex"
```

---

### Task 2: Migración SQL — outreach_messages y vex_conversaciones

**Files:**
- Create: `supabase/migrations/012_vex_outreach.sql`

**Interfaces:**
- Produces: tablas `outreach_messages` y `vex_conversaciones` (las usan Tasks 6-8).

- [ ] **Step 1: Escribir la migración**

Antes, leer `supabase/migrations/011_notificaciones.sql` para copiar el estilo de RLS del repo.

```sql
-- 012: Vex (scraper-clientes) — registro de outreach + historial de chat
CREATE TABLE IF NOT EXISTS outreach_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES fact_leads(id) ON DELETE CASCADE,
  canal          TEXT NOT NULL CHECK (canal IN ('whatsapp','email','social')),
  texto          TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviado','fallido')),
  aprobado_por   UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL,
  wa_message_id  TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_messages(lead_id);
-- Idempotencia del primer contacto: un solo "enviado" por lead+canal
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_enviado
  ON outreach_messages(lead_id, canal) WHERE estado = 'enviado';

CREATE TABLE IF NOT EXISTS vex_conversaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrante_id  UUID NOT NULL REFERENCES dim_integrantes(id) ON DELETE CASCADE,
  rol            TEXT NOT NULL CHECK (rol IN ('user','vex')),
  texto          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vexconv_integrante ON vex_conversaciones(integrante_id, created_at);

ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE vex_conversaciones ENABLE ROW LEVEL SECURITY;

-- Equipo autenticado lee outreach; escribe el server (service role bypasea RLS)
CREATE POLICY outreach_select ON outreach_messages FOR SELECT TO authenticated USING (true);
-- Cada integrante ve solo su conversación con Vex
CREATE POLICY vexconv_select ON vex_conversaciones FOR SELECT TO authenticated
  USING (integrante_id IN (SELECT id FROM dim_integrantes WHERE auth_user_id = auth.uid()));
GRANT SELECT ON outreach_messages, vex_conversaciones TO authenticated;
GRANT ALL ON outreach_messages, vex_conversaciones TO service_role;
```

- [ ] **Step 2: Aplicarla en Supabase** (como se apliquen las demás en este repo — revisar si hay CLI linkeada `npx supabase migration up` o aplicar por el SQL editor del dashboard con las keys de `.env.local`; preguntar a Cristian si no hay credenciales).

- [ ] **Step 3: Verificar** con una query REST (`GET /rest/v1/outreach_messages?select=id&limit=1` con service key → `[]`, no 404).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_vex_outreach.sql
git commit -m "feat(db): tablas de Vex — outreach_messages y vex_conversaciones"
```

---

### Task 3: `lib/vex/telefono.ts` — normalización y link wa.me (TDD)

**Files:**
- Create: `lib/vex/telefono.ts`, `lib/vex/telefono.test.ts`

**Interfaces:**
- Produces: `normalizarTelefono(t: string|null|undefined): string|null`, `construirLinkWhatsApp(t: string|null|undefined, texto: string): string|null`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { normalizarTelefono, construirLinkWhatsApp } from './telefono'

describe('normalizarTelefono', () => {
  it('agrega 56 a móvil chileno de 9 dígitos', () => expect(normalizarTelefono('987654321')).toBe('56987654321'))
  it('respeta números que ya traen 56', () => expect(normalizarTelefono('+56 9 8765 4321')).toBe('56987654321'))
  it('asume móvil en 8 dígitos', () => expect(normalizarTelefono('87654321')).toBe('56987654321'))
  it('rechaza basura corta', () => expect(normalizarTelefono('123')).toBeNull())
  it('rechaza null', () => expect(normalizarTelefono(null)).toBeNull())
})

describe('construirLinkWhatsApp', () => {
  it('arma el link con texto urlencoded', () =>
    expect(construirLinkWhatsApp('987654321', 'hola ¿qué tal?')).toBe(
      'https://wa.me/56987654321?text=hola%20%C2%BFqu%C3%A9%20tal%3F'))
  it('null si el teléfono no sirve', () => expect(construirLinkWhatsApp('12', 'hola')).toBeNull())
})
```

- [ ] **Step 2: Correr y ver FAIL** — `npm test` → "Cannot find module './telefono'".

- [ ] **Step 3: Implementar** — portar tal cual las funciones `normalizarTelefono` y `construirLinkWhatsApp` de `C:\Users\delaf\OneDrive\Desktop\leads-dashboard\src\features\trybot\utils\channels.ts` (líneas 24-45; NO portar `canalesDisponibles`, acá el canal es whatsapp/social y se decide en draft.ts).

- [ ] **Step 4: `npm test` → PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(vex): normalización de teléfonos CL y links wa.me (port del trybot)"`

---

### Task 4: `lib/vex/llm.ts` — motor Groq con reintentos (TDD)

**Files:**
- Create: `lib/vex/llm.ts`, `lib/vex/llm.test.ts`

**Interfaces:**
- Produces: `llmJSON(prompt: string): Promise<string>`, `llmTexto(prompt: string): Promise<string>`, `MODELO` (env `VEX_MODEL` || `"llama-3.3-70b-versatile"`). Interno testeable: `conReintento<T>(fn, intentos=3)` exportado.

- [ ] **Step 1: Test que falla** (se testea el reintento, no Groq):

```ts
import { describe, it, expect, vi } from 'vitest'
import { conReintento } from './llm'

describe('conReintento', () => {
  it('reintenta ante 429 y devuelve el éxito', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce('ok')
    await expect(conReintento(fn, 3)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('NO reintenta errores no transitorios', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 invalid api key'))
    await expect(conReintento(fn, 3)).rejects.toThrow('401')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('agota los intentos y tira el último error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('503 unavailable'))
    await expect(conReintento(fn, 2)).rejects.toThrow('503')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementar** — portar `C:\Users\delaf\OneDrive\Desktop\leads-dashboard\src\features\trybot\services\llm.ts` completo con estos cambios exactos: exportar `conReintento`; `MODELO = process.env.VEX_MODEL || "llama-3.3-70b-versatile"`; en el sleep del reintento usar `1200 * (i + 1)` pero permitir inyección para tests (`conReintento(fn, intentos, sleepMs = (n)=>new Promise(r=>setTimeout(r, 1200*n)))`). Cliente Groq PEREZOSO (se instancia en la 1ª llamada — si no, rompe el build de Vercel al recolectar page data; lección aprendida en Railway).

- [ ] **Step 4: PASS** (los tests de reintento pasan `sleepMs = async () => {}`).

- [ ] **Step 5: Commit** — `git commit -m "feat(vex): motor LLM Groq con cliente perezoso y reintentos ante 429/503"`

---

### Task 5: `lib/vex/cartera.ts` — reporte, recomendar, marcar (TDD)

**Files:**
- Create: `lib/vex/cartera.ts`, `lib/vex/cartera.test.ts`, `lib/vex/texto.ts` (port de `coincideTermino`)

**Interfaces:**
- Consumes: nada de Vex (usa el client Supabase que le inyectan).
- Produces (todas reciben `sb` como 1er parámetro — el route handler les pasa el client de sesión):
  - `reporteCartera(sb): Promise<Record<EstadoLead, number> & { total: number }>`
  - `recomendarLeads(sb, opts: { nicho?: string; localidad?: string; cantidad?: number }): Promise<LeadResumen[]>`
  - `buscarLeadsPorNombre(sb, nombre: string, limite?: number)`
  - `marcarEstado(sb, leadIds: string[], estado: EstadoLead): Promise<number>`
  - `ESTADOS_LEAD: EstadoLead[]` y tipo `EstadoLead` (los 6 estados del CRM + los que agregue la migración 003 — LEER `003_leads_won_lost.sql` primero y usar la lista real).
  - `LeadResumen = { id: string; nombre_negocio: string; nicho: string|null; localidad: string|null; score: number|null; telefono: string|null; redes_sociales: Record<string,string>|null }`

Adaptaciones vs. el trybot viejo (`leads-dashboard\src\features\trybot\services\cartera.ts`): columnas `nombre_negocio/localidad/redes_sociales`, ids UUID (`string[]`), estado "nuevo" → `sin_contactar`, y el client se INYECTA (el viejo importaba un singleton). `coincideTermino` se porta de `leads-dashboard\src\features\trybot\utils\text.ts` tal cual (ignora tildes/mayúsculas/plural).

- [ ] **Step 1: Tests que fallan** (mock de Supabase con chainable builder):

```ts
import { describe, it, expect, vi } from 'vitest'
import { marcarEstado, recomendarLeads } from './cartera'

function sbMock(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  const chain = ['from','select','eq','in','order','limit','update'] as const
  for (const m of chain) q[m] = vi.fn(() => q)
  ;(q as { then?: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null, count: rows.length })
  return q as never
}

describe('marcarEstado', () => {
  it('rechaza estados fuera de la lista', async () => {
    await expect(marcarEstado(sbMock([]), ['abc'], 'volando' as never)).rejects.toThrow(/inválido/i)
  })
  it('devuelve 0 sin ids, sin tocar la BD', async () => {
    const sb = sbMock([])
    await expect(marcarEstado(sb, [], 'contactado')).resolves.toBe(0)
  })
})

describe('recomendarLeads', () => {
  it('filtra leads sin teléfono ni redes y respeta cantidad', async () => {
    const rows = [
      { id: '1', nombre_negocio: 'A', nicho: 'panadería', localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null },
      { id: '2', nombre_negocio: 'B', nicho: 'panadería', localidad: 'Maipú', score: 80, telefono: null, redes_sociales: null },
    ]
    const out = await recomendarLeads(sbMock(rows), { cantidad: 5 })
    expect(out.map(l => l.id)).toEqual(['1'])
  })
})
```

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implementar** (adaptar el service viejo con las 4 diferencias de arriba). — [ ] **Step 4: PASS + tsc.**

- [ ] **Step 5: Commit** — `git commit -m "feat(vex): cartera de leads (reporte/recomendar/marcar) adaptada al schema del CRM"`

---

### Task 6: `lib/vex/draft.ts` — copy PAS por lead (TDD)

**Files:**
- Create: `lib/vex/draft.ts`, `lib/vex/draft.test.ts`

**Interfaces:**
- Consumes: `llmJSON` (Task 4), `construirLinkWhatsApp` (Task 3), `LeadResumen` (Task 5).
- Produces: `generarDraftLead(lead: LeadResumen & { tiene_web?: boolean|null; info_texto?: string|null }, customPrompt?: string, llm = llmJSON): Promise<DraftLead>` con `DraftLead = { lead_id: string; nombre: string; telefono: string|null; whatsapp: { text: string; link: string|null } | null; social: { text: string } | null; aviso?: string }`.

Base = `C:\Users\delaf\OneDrive\Desktop\leads-dashboard\src\features\trybot\services\draft.ts` (el prompt PAS completo de las líneas 53-106 se copia ÍNTEGRO — es el copy validado). Cambios exactos: (1) sin canal email — canales = whatsapp si `telefono`, social si `redes_sociales` con alguna clave; (2) datos del lead desde las columnas del CRM (`nombre_negocio`, `localidad` en vez de comuna/región, sin rating/reseñas — quitar esas 2 líneas del bloque "Datos del lead" y del punto 1 del framework dejar solo el gancho "sin web = invisible en Google"); (3) el JSON pedido solo con `whatsapp_text` y `social_text`; (4) `llm` inyectable para tests; (5) `AGENDA_URL = "https://tryvex.tech"` se mantiene.

- [ ] **Step 1: Tests que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { generarDraftLead } from './draft'

const lead = { id: 'u1', nombre_negocio: 'Panadería San José', nicho: 'panadería',
  localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null }

describe('generarDraftLead', () => {
  it('genera whatsapp con link cuando hay teléfono', async () => {
    const llm = async () => JSON.stringify({ whatsapp_text: 'Hola 👋 mira tryvex.tech' })
    const d = await generarDraftLead(lead, undefined, llm)
    expect(d.whatsapp?.text).toContain('tryvex.tech')
    expect(d.whatsapp?.link).toMatch(/^https:\/\/wa\.me\/56987654321\?text=/)
    expect(d.social).toBeNull()
  })
  it('avisa cuando el lead no tiene ningún canal', async () => {
    const d = await generarDraftLead({ ...lead, telefono: null }, undefined, async () => '{}')
    expect(d.aviso).toMatch(/sin canal/i)
  })
  it('avisa cuando la IA devuelve JSON inválido', async () => {
    const d = await generarDraftLead(lead, undefined, async () => 'no soy json')
    expect(d.aviso).toMatch(/JSON/i)
  })
})
```

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implementar.** — [ ] **Step 4: PASS + tsc.**

- [ ] **Step 5: Commit** — `git commit -m "feat(vex): borradores de outreach por lead (copy PAS, WhatsApp primero)"`

---

### Task 7: Chat de Vex — intenciones + `/api/vex/chat`

**Files:**
- Create: `lib/vex/intenciones.ts`, `lib/vex/intenciones.test.ts`, `app/api/vex/chat/route.ts`

**Interfaces:**
- Consumes: `llmJSON`/`llmTexto` (T4), cartera (T5), `generarDraftLead` (T6).
- Produces: `POST /api/vex/chat` body `{ mensaje: string }` → `{ respuesta: string, borradores?: DraftLead[] }`. Guarda ambos turnos en `vex_conversaciones`.

`clasificarIntencion(mensaje, historial, llm = llmJSON): Promise<Accion[]>` con `Accion = { tipo: 'reporte' } | { tipo: 'recomendar', nicho?, localidad?, cantidad? } | { tipo: 'marcar', nombres: string[], estado: EstadoLead } | { tipo: 'preparar_envio', nicho?, localidad?, cantidad?, instrucciones? } | { tipo: 'conversar' }`. Patrón del trybot viejo (`/api/trybot/chat`): clasificar (JSON) → ejecutar cada acción (tope 5) → redactar respuesta final con `llmTexto` incluyendo los resultados. Personalidad del prompt final: "Eres Vex, el agente de Tryvex: compañero directo, chileno neutro, cero humo; respondes corto y concreto".

- [ ] **Step 1: Test de intenciones que falla** (llm inyectado):

```ts
import { describe, it, expect } from 'vitest'
import { clasificarIntencion } from './intenciones'

it('parsea acciones múltiples y aplica el tope de 5', async () => {
  const llm = async () => JSON.stringify({ acciones: Array(8).fill({ tipo: 'reporte' }) })
  const acc = await clasificarIntencion('dame todo', [], llm)
  expect(acc).toHaveLength(5)
})
it('cae a conversar si el JSON no trae acciones válidas', async () => {
  const acc = await clasificarIntencion('hola', [], async () => '{"acciones":[{"tipo":"bailar"}]}')
  expect(acc).toEqual([{ tipo: 'conversar' }])
})
```

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implementar `intenciones.ts`** (prompt clasificador en español que describe las 5 acciones y sus parámetros, `response_format` json; validar con Zod y descartar acciones desconocidas). — [ ] **Step 4: PASS.**

- [ ] **Step 5: Route handler** `app/api/vex/chat/route.ts`: patrón auth estándar → buscar `integrante_id` (`dim_integrantes` por `auth_user_id = user.id`) → cargar últimas 20 filas de `vex_conversaciones` → `clasificarIntencion` → ejecutar acciones con el client de sesión (para `preparar_envio`: `recomendarLeads` + `generarDraftLead` por cada uno, máx 10) → `llmTexto` para la respuesta → insertar turnos `user` y `vex` (insertar con el client del server usando service role: `createClient` de `@supabase/supabase-js` + `SUPABASE_SERVICE_ROLE_KEY`, mismo patrón del webhook scraper) → devolver `{ respuesta, borradores }`. Errores de Groq → 200 con `respuesta: "Groq está sin cuota o caído, dame unos minutos y reintentá."` (nunca spinner mudo).

- [ ] **Step 6: `tsc` + build + commit** — `git commit -m "feat(vex): chat del agente — clasifica intenciones, ejecuta y responde con historial"`

---

### Task 8: WhatsApp Cloud API — `lib/vex/whatsapp.ts` + `/api/vex/whatsapp/send`

**Files:**
- Create: `lib/vex/whatsapp.ts`, `lib/vex/whatsapp.test.ts`, `app/api/vex/whatsapp/send/route.ts`

**Interfaces:**
- Consumes: `normalizarTelefono` (T3).
- Produces: `enviarPlantillaPrimerContacto(telefono, nombreNegocio, fetchFn = fetch): Promise<{ok:true; proveedorId:string|null}|{ok:false; error:string}>`, `whatsappConfigurado(): boolean`. Endpoint `POST /api/vex/whatsapp/send` body `{ lead_id: string, texto: string, confirmar: boolean }`.

- [ ] **Step 1: Portar el service** desde `C:\Users\delaf\OneDrive\Desktop\leads-dashboard\src\features\trybot\services\whatsapp.ts` (está completo y probado en diseño: Graph v21.0, plantilla con `{{1}}` = nombre del negocio, envs `WHATSAPP_TOKEN/PHONE_NUMBER_ID/TEMPLATE_NAME/TEMPLATE_LANG`). Único cambio: `fetchFn` inyectable.

- [ ] **Step 2: Test que falla**

```ts
import { describe, it, expect, vi } from 'vitest'
import { enviarPlantillaPrimerContacto } from './whatsapp'

it('sin config devuelve error claro sin llamar a Meta', async () => {
  const f = vi.fn()
  const r = await enviarPlantillaPrimerContacto('987654321', 'Panadería', f)
  expect(r.ok).toBe(false)
  expect(f).not.toHaveBeenCalled()
})
it('con config manda la plantilla y devuelve el id', async () => {
  process.env.WHATSAPP_TOKEN = 't'; process.env.WHATSAPP_PHONE_NUMBER_ID = '1'
  process.env.WHATSAPP_TEMPLATE_NAME = 'primer_contacto'
  const f = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }))
  const r = await enviarPlantillaPrimerContacto('987654321', 'Panadería', f as never)
  expect(r).toEqual({ ok: true, proveedorId: 'wamid.X' })
  delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID; delete process.env.WHATSAPP_TEMPLATE_NAME
})
```

- [ ] **Step 3: PASS.**

- [ ] **Step 4: Route `send`**: auth estándar → Zod `{ lead_id: uuid, texto: string min 1, confirmar: literal(true) }` (sin `confirmar:true` → 400 "Falta confirmación humana") → cargar lead (404 si no existe) → si ya hay `outreach_messages` `enviado` canal whatsapp para ese lead → 409 "Ya se le envió el primer contacto" → si `whatsappConfigurado()`: enviar plantilla; registrar en `outreach_messages` (`enviado` con `wa_message_id` o `fallido` con `error`), `aprobado_por` = integrante de la sesión; actualizar lead `estado='contactado'`, `ultimo_contacto=now()`; insertar `interacciones_lead` (`tipo:'whatsapp'`, `contenido: texto`) para el timeline → si NO está configurado: 200 `{ fallback: true, link: construirLinkWhatsApp(...) }` y registrar `borrador`. Escrituras con service role client (patrón webhook).

- [ ] **Step 5: `tsc` + build + commit** — `git commit -m "feat(vex): envío WhatsApp Cloud API con aprobación humana, idempotencia y registro en timeline"`

---

### Task 9: UI — sección `/vex`

**Files:**
- Create: `app/(app)/vex/page.tsx`, `components/vex/vex-chat.tsx`, `components/vex/tarjeta-borrador.tsx`
- Modify: el nav/sidebar del layout `app/(app)/layout.tsx` (o el componente de navegación que use — buscarlo con grep de "leads" en components/) agregando el ítem "Vex" con ícono `Bot` de lucide-react.

**Interfaces:**
- Consumes: `POST /api/vex/chat` (T7), `POST /api/vex/whatsapp/send` (T8).

- [ ] **Step 1: Mirar 2 páginas existentes** (`app/(app)/leads/page.tsx` y su detalle) para copiar patrones de layout, tokens CSS y client components del repo. La UI debe verse NATIVA del CRM, no pegada.

- [ ] **Step 2: `vex-chat.tsx`** (client component): historial de burbujas (cargar de `/api/vex/chat` GET no existe — el historial llega en la página como server component leyendo `vex_conversaciones` del integrante; el client mantiene estado local al enviar), input + botón enviar, estado "Vex está pensando…" mientras espera, error visible si el fetch falla. Cuando la respuesta trae `borradores`, renderiza una `tarjeta-borrador` por lead.

- [ ] **Step 3: `tarjeta-borrador.tsx`**: nombre del negocio, teléfono, textarea editable con el texto propuesto, y botones: **"Aprobar y enviar"** (POST send con `confirmar:true`; si responde `fallback:true` abre el `link` wa.me en pestaña nueva y muestra "enviado manual"), **"Simular"** (muestra qué se enviaría, no llama al send), **"Descartar"**. Estados visibles: enviado ✅ / fallido ❌ con el error / manual 📲.

- [ ] **Step 4: `page.tsx`** (server component): auth como las demás páginas del grupo `(app)`, carga integrante + últimas 50 filas de su `vex_conversaciones`, header "Vex · scraper-clientes" con selector de agente deshabilitado ("más agentes pronto"), monta `<VexChat historial={...} />`.

- [ ] **Step 5: Verificar en dev** — `npm run dev`, entrar a `/vex` logueado: el chat responde un reporte real, "prepará envío a 2 panaderías" muestra tarjetas. `tsc` + build.

- [ ] **Step 6: Commit** — `git commit -m "feat(vex): sección /vex — chat con Vex y tarjetas de envío con aprobación"`

---

### Task 10: Migración de los 308 leads viejos

**Files:**
- Create: `scripts/migrar-leads-viejos.ts`, `scripts/dedupe.ts`, `scripts/dedupe.test.ts`

**Interfaces:**
- Consumes: BD vieja `https://spztucwmdyzulpldfzha.supabase.co` (keys en `C:\Users\delaf\OneDrive\Desktop\leads-dashboard\.env.local` — pedirlas a Cristian como env `OLD_SUPABASE_URL/OLD_SUPABASE_KEY`, NO commitearlas).
- Produces: leads viejos en `fact_leads` del CRM. `claveDedupe(nombre: string, telefono: string|null): string` (normaliza tildes/mayúsculas/espacios + solo dígitos del teléfono).

- [ ] **Step 1: Test de dedupe que falla**

```ts
import { it, expect } from 'vitest'
import { claveDedupe } from './dedupe'

it('misma clave con tildes, mayúsculas y formato de teléfono distinto', () => {
  expect(claveDedupe('Panadería San José', '+56 9 8765 4321'))
    .toBe(claveDedupe('panaderia san jose', '56987654321'))
})
it('distinta clave si el teléfono difiere', () => {
  expect(claveDedupe('X', '111111111')).not.toBe(claveDedupe('X', '222222222'))
})
```

- [ ] **Step 2: FAIL → implementar → PASS.**

- [ ] **Step 3: Script principal** (`npx tsx scripts/migrar-leads-viejos.ts`, correr con `npm i -D tsx` si falta): lee TODOS los `fact_leads` viejos (paginando de a 500), mapea → `{ nombre_negocio: v.nombre, telefono, info_texto, redes_sociales: v.redes ? { otra: v.redes } : null, tiene_web, url_web: v.web ?? null, nicho, localidad: v.comuna ?? null, score: escalar 1-10 → x10 acotado 0-100, estado: 'sin_contactar', origen: 'scraper', notas: v.notas ?? null }` (verificar los nombres reales de columnas viejas leyendo `leads-dashboard\src\features\leads\types\lead.types.ts` ANTES de codear el mapeo); carga los existentes del CRM y arma el set de `claveDedupe`; inserta solo los nuevos con service role; imprime reporte `insertados/saltados/errores`. Idempotente: correrlo 2 veces → la 2ª inserta 0.

- [ ] **Step 4: Correrlo de verdad** (con OK de Cristian), correrlo DOS veces y pegar el reporte de ambas corridas en el PR. Verificar en la UI `/leads` del CRM que se ven.

- [ ] **Step 5: Commit** — `git commit -m "feat(scripts): migración one-shot de los leads del dashboard viejo (dedupe idempotente)"`

---

### Task 11: Cierre — E2E en preview, scraper y PR

**Files:**
- Modify: `README.md` (sección Vex: qué es, envs nuevas, cómo probar)

- [ ] **Step 1: Push de la rama** — `git push -u origin feat/vex-agente` → Vercel crea el deploy de preview.
- [ ] **Step 2: Envs en Vercel** (con Cristian): `GROQ_API_KEY`, y cuando existan `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME=primer_contacto`, `WHATSAPP_TEMPLATE_LANG=es`.
- [ ] **Step 3: E2E en el preview** (Cristian desde el celu): chat reporte real → preparar envío → tarjetas → "Simular" → "Aprobar" SIN plantilla configurada (debe abrir wa.me) → cuando Meta apruebe: envío real de plantilla AL NÚMERO DE CRISTIAN.
- [ ] **Step 4: Scraper**: en el `.env` de `scrapper-tryvex` apuntar `WEBHOOK_URL` a `https://tryvexplataform.vercel.app/api/webhook/scraper` + `SCRAPER_WEBHOOK_SECRET` del CRM. Probar con 1 lead de prueba y borrarlo.
- [ ] **Step 5: README + PR** — actualizar README y abrir PR a `main` con: qué se construyó y por qué, decisiones (BD única, WhatsApp como canal, aprobación humana), reporte de la migración de leads, capturas de `/vex`, y el pendiente de la plantilla Meta. Cuerpo termina con la línea de generado con Claude Code. **El equipo revisa y mergea — no automergear.**

---

## Self-review (hecho)

- **Cobertura de spec:** datos/migración (T2, T10), UI (T9), cerebro (T4-T7), WhatsApp (T8), scraper (T11.4), errores (T4 reintentos, T7 aviso Groq, T8 fallido visible), testing (todas + T11 E2E). ✅
- **Placeholders:** los ports referencian rutas exactas del código fuente existente con los cambios enumerados — el código viejo ES el contenido. ✅
- **Consistencia de tipos:** `LeadResumen` (T5) es lo que consume T6/T7; ids UUID `string[]` en toda la cadena; `DraftLead` de T6 es lo que rinde T7 y consume T9. ✅
