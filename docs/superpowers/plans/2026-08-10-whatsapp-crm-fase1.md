# WhatsApp dentro del CRM — Fase 1 (la cañería)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un mensaje escrito en el CRM llegue por WhatsApp al celular de Cristian, y que su respuesta aparezca en el hilo del CRM.

**Architecture:** Se invierte la llamada. Hoy Next.js hace `fetch` al puente, y el puente solo escucha en `127.0.0.1` — desde Vercel es inalcanzable. En vez de exponerlo, el CRM **anota** el mensaje en `outreach_messages` y el puente lo **pasa a buscar** cada 10 s. Mismo patrón que `scraper_runs` (migración 040). Los entrantes no cambian: el puente ya escribe directo en Supabase.

**Tech Stack:** Node 22 ESM (`wa-bridge/`, whatsapp-web.js), Next.js App Router + TypeScript + zod (`app/api/`), Supabase Postgres, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-whatsapp-dentro-del-crm-design.md`
- Rama: `feat/whatsapp-dentro-del-crm`. Nada directo a `main` — es el repo de un equipo con un cliente real.
- **La lista blanca se despliega ANTES de vincular el WhatsApp.** Si se vincula primero, cada mensaje personal que le llegue a Cristian queda guardado en la base de la empresa y se crean fichas de sus contactos. Ese orden no se negocia.
- El puente vive en el repo (`wa-bridge/`) y se **despliega** copiando a `/opt/wa-bridge` en `179.197.224.95` (usuario `bridge`). Al 10-ago repo y servidor están idénticos (mismo md5).
- El puente es JS ESM sin build. No agregar dependencias nuevas.
- `WA_BRIDGE_SOLO_NUMEROS` vacía o ausente = comportamiento de hoy, sin filtro. El modo prueba se saca borrando una línea del `.env`.
- Números en formato `56XXXXXXXXX` (solo dígitos, con código de país), igual que `normalizarTelefono`.

**Dato que hay que pedirle a Cristian antes de la Task 6:** su número de WhatsApp,
para la lista blanca y para el lead de prueba. No está en ningún archivo del repo
ni debe quedar escrito en git — va solo en el `.env` del servidor.

---

### Task 1: La regla de la lista blanca (pieza pura + tests)

Es lo único que protege la privacidad de Cristian, así que va aparte y probado antes de tocar el puente.

**Files:**
- Create: `wa-bridge/permitidos.js`
- Test: `wa-bridge/permitidos.test.js`
- Modify: `vitest.config.ts:5` (el `include` no cubre `wa-bridge/`)

**Interfaces:**
- Produces: `parsearPermitidos(cadena: string|undefined) => string[]` y `estaPermitido(numero: string|null, permitidos: string[]) => boolean`. Los usa la Task 2.
- Contrato: lista vacía = **todo permitido** (sin modo prueba). Esto es a propósito: el filtro es opt-in.

- [ ] **Step 1: Escribir el test que falla**

```javascript
// wa-bridge/permitidos.test.js
import { describe, it, expect } from 'vitest'
import { parsearPermitidos, estaPermitido } from './permitidos.js'

describe('parsearPermitidos', () => {
  it('sin variable no hay filtro', () => {
    expect(parsearPermitidos(undefined)).toEqual([])
    expect(parsearPermitidos('')).toEqual([])
    expect(parsearPermitidos('   ')).toEqual([])
  })

  it('separa por comas y limpia espacios', () => {
    expect(parsearPermitidos('56911111111, 56922222222')).toEqual(['56911111111', '56922222222'])
  })

  it('se queda solo con los digitos', () => {
    expect(parsearPermitidos('+56 9 1111 1111')).toEqual(['56911111111'])
  })

  it('descarta entradas vacias entre comas', () => {
    expect(parsearPermitidos('56911111111,,')).toEqual(['56911111111'])
  })
})

describe('estaPermitido', () => {
  const lista = ['56911111111']

  it('lista vacia = pasa todo (modo prueba apagado)', () => {
    expect(estaPermitido('56999999999', [])).toBe(true)
  })

  it('deja pasar al que esta en la lista', () => {
    expect(estaPermitido('56911111111', lista)).toBe(true)
  })

  it('bloquea al que no esta', () => {
    expect(estaPermitido('56999999999', lista)).toBe(false)
  })

  it('compara sin importar el formato', () => {
    expect(estaPermitido('+56 9 1111 1111', lista)).toBe(true)
  })

  it('un numero nulo o vacio nunca pasa el filtro', () => {
    expect(estaPermitido(null, lista)).toBe(false)
    expect(estaPermitido('', lista)).toBe(false)
  })

  it('con lista vacia, un numero nulo tampoco rompe', () => {
    expect(estaPermitido(null, [])).toBe(true)
  })
})
```

- [ ] **Step 2: Ampliar vitest para que vea el puente**

En `vitest.config.ts`, línea 5, reemplazar:

```typescript
  test: { include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts'], passWithNoTests: true },
```

por:

```typescript
  // wa-bridge es JS ESM (proceso aparte, sin build). Sus reglas puras se
  // prueban con el mismo runner que el resto del repo.
  test: { include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts', 'wa-bridge/**/*.test.js'], passWithNoTests: true },
```

- [ ] **Step 3: Correr el test y ver que falla**

Run: `npx vitest run wa-bridge/permitidos.test.js`
Expected: FAIL — `Failed to resolve import "./permitidos.js"`

- [ ] **Step 4: Escribir la implementación mínima**

```javascript
// wa-bridge/permitidos.js
//
// Modo prueba: mientras se pilotea con el numero PERSONAL de alguien, el puente
// solo puede tocar las conversaciones autorizadas.
//
// Por que existe: el puente guarda TODO mensaje entrante y, si el numero no
// corresponde a ningun lead, CREA una ficha con ese numero y el texto
// (crearLeadDesdeNumeroDesconocido). Con un numero comercial eso es correcto
// — no se pierde un cliente potencial. Con un numero personal significa que la
// familia y los amigos terminan en la base de la empresa, legibles por todo el
// equipo, sin haberlo consentido nunca.
//
// Lista vacia = sin filtro, el comportamiento de siempre. El filtro es opt-in
// para que sacarlo sea borrar una linea del .env y no revertir codigo.

/** Deja un telefono en solo digitos, para comparar sin importar el formato. */
function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/** Lee WA_BRIDGE_SOLO_NUMEROS y devuelve la lista de numeros normalizados. */
export function parsearPermitidos(cadena) {
  return String(cadena ?? '')
    .split(',')
    .map(soloDigitos)
    .filter(Boolean)
}

/**
 * ¿Este numero se puede tocar?
 *
 * Con la lista vacia pasa todo (modo prueba apagado). Con lista, un numero
 * ausente o ilegible NO pasa: ante la duda, no se guarda nada de nadie.
 */
export function estaPermitido(numero, permitidos) {
  if (!permitidos || permitidos.length === 0) return true
  const limpio = soloDigitos(numero)
  if (!limpio) return false
  return permitidos.includes(limpio)
}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `npx vitest run wa-bridge/permitidos.test.js`
Expected: PASS — 11 tests

- [ ] **Step 6: Correr TODA la batería, para no romper nada**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add wa-bridge/permitidos.js wa-bridge/permitidos.test.js vitest.config.ts
git commit -m "wa-bridge: la regla de la lista blanca, con sus pruebas

Mientras se pilotea con un numero personal, el puente solo puede tocar las
conversaciones autorizadas. Sin esto, cada mensaje que le llegue a esa persona
se guarda en la base de la empresa y se crea una ficha de quien escribio.

Va aparte y probado antes de tocar el puente: es lo unico que protege eso."
```

---

### Task 2: Enchufar la lista blanca en el puente

**Files:**
- Modify: `wa-bridge/index.js` (import arriba, constante de config, filtro en entrantes y en salientes)
- Modify: `wa-bridge/ENV-SETUP.md` (documentar la variable)

**Interfaces:**
- Consumes: `parsearPermitidos`, `estaPermitido` de la Task 1.
- Produces: nada nuevo hacia otras tasks.

- [ ] **Step 1: Importar y leer la configuración**

En `wa-bridge/index.js`, después de `import { createClient } from '@supabase/supabase-js'` (~línea 19), agregar:

```javascript
import { parsearPermitidos, estaPermitido } from './permitidos.js'
```

Y después de `const SEND_INTERVAL_MS = ...` (~línea 26), agregar:

```javascript
// Modo prueba: si esta puesta, el puente SOLO toca estas conversaciones.
// Vacia o ausente = comportamiento normal. Ver permitidos.js para el porque.
const SOLO_NUMEROS = parsearPermitidos(env.WA_BRIDGE_SOLO_NUMEROS)
if (SOLO_NUMEROS.length > 0) {
  console.warn(`[wa-bridge] MODO PRUEBA: solo se atienden ${SOLO_NUMEROS.length} numero(s). El resto se ignora entero.`)
}
```

- [ ] **Step 2: Filtrar los entrantes**

En `waClient.on('message', ...)`, justo después de `const numero = msg.from.replace('@c.us', '')`, agregar **antes** de resolver el lead:

```javascript
    // Modo prueba: si no esta autorizado, no se guarda NADA — ni el texto, ni
    // el numero, ni una ficha. Va antes de resolverLeadPorTelefono a proposito:
    // ese camino crea leads, y crear una ficha ya seria registrar a la persona.
    if (!estaPermitido(numero, SOLO_NUMEROS)) return
```

- [ ] **Step 3: Filtrar los salientes**

En el handler de `POST /send`, justo después del bloque que valida `telefono` (el que responde 400 `'telefono invalido o ausente'`), agregar:

```javascript
    // En modo prueba, un envio a un numero no autorizado se rechaza: una prueba
    // no puede terminar llegandole a un lead real.
    if (!estaPermitido(telefono, SOLO_NUMEROS)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'modo prueba activo: ese numero no esta en WA_BRIDGE_SOLO_NUMEROS' }))
      return
    }
```

- [ ] **Step 4: Documentar la variable**

Agregar al final de `wa-bridge/ENV-SETUP.md`:

```markdown
## `WA_BRIDGE_SOLO_NUMEROS` (opcional — modo prueba)

Lista de números separados por coma, en formato `56XXXXXXXXX`.

Si está puesta, el puente **solo** atiende esas conversaciones: los mensajes
entrantes de cualquier otro número **se ignoran enteros** (no se guardan, no se
crea ficha) y los envíos hacia otro número se rechazan con 403.

Existe para poder pilotear con el WhatsApp **personal** de alguien sin que sus
conversaciones privadas entren a la base de la empresa. Ver `permitidos.js`.

Vacía o ausente = comportamiento normal, sin filtro.

```env
WA_BRIDGE_SOLO_NUMEROS=56911111111
```
```

- [ ] **Step 5: Verificar que el archivo sigue siendo válido**

Run: `node --check wa-bridge/index.js`
Expected: sin salida (OK)

- [ ] **Step 6: Commit**

```bash
git add wa-bridge/index.js wa-bridge/ENV-SETUP.md
git commit -m "wa-bridge: modo prueba, para pilotear con un numero personal

El filtro de entrantes va ANTES de resolver el lead: ese camino crea fichas, y
crear una ficha ya es registrar a la persona. Los salientes tambien se filtran,
para que una prueba no le llegue por accidente a un lead real."
```

---

### Task 3: La migración del buzón

**Files:**
- Create: `supabase/migrations/041_buzon_whatsapp.sql`

**Interfaces:**
- Produces: estado `encolado` y columna `enviado_por` en `outreach_messages`. Los usan las Tasks 4 y 5.

- [ ] **Step 1: Escribir la migración**

```sql
-- El buzon de salida de WhatsApp.
--
-- El CRM corre en Vercel y el puente escucha solo en 127.0.0.1 del VPS: desde
-- internet es inalcanzable, y por eso "Enviar desde el CRM" nunca funciono.
--
-- En vez de exponer el puente (puerto abierto, o un tunel de Cloudflare cuya
-- direccion cambia en cada reinicio — ya mordio dos veces la semana del 8-ago),
-- se da vuelta la llamada: el CRM ANOTA aca, y el puente lo PASA A BUSCAR.
-- Mismo patron que scraper_runs (040). Sin puerto abierto, sin direccion que se
-- mueva, y si el puente esta caido el mensaje queda encolado en vez de perderse.
--
-- Idempotente: se puede correr dos veces.

-- 1. El estado que faltaba ---------------------------------------------------
-- La tabla ya tenia 'borrador', 'enviado' y 'fallido', pero ninguno significa
-- "listo para mandar, todavia sin mandar" — que es lo unico que un buzon
-- necesita. 'borrador' no sirve: un borrador es algo que alguien todavia esta
-- escribiendo, no algo que ya se pidio mandar.
--
-- Y hace falta 'enviando' aparte de 'encolado': el puente tiene que reservar la
-- fila ANTES de mandar (si no, dos vueltas mandan el mismo mensaje dos veces y
-- eso no se deshace), pero marcarla 'enviado' en ese momento seria mentir —
-- todavia no salio. Una fila trabada en 'enviando' es visible y se puede
-- revisar; un mensaje duplicado a un cliente, no.
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_estado_check;
ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_estado_check
  CHECK (estado IN ('borrador', 'encolado', 'enviando', 'enviado', 'fallido'));

-- 2. Quien lo mando ----------------------------------------------------------
-- El puente ya escribe la atribucion en mensajes_wa.enviado_por; sin esta
-- columna, al pasar por el buzon ese dato se perdia en el camino.
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS enviado_por TEXT;

-- 3. Lo unico que el puente consulta -----------------------------------------
-- Indice parcial: la cola es corta y la tabla crece para siempre.
CREATE INDEX IF NOT EXISTS idx_outreach_encolados
  ON outreach_messages (created_at) WHERE estado = 'encolado';
```

- [ ] **Step 2: Aplicar la migración**

Aplicar en el proyecto `wfsjzhshkaokjoansbhc` (Tryvex-Agency Project), por el SQL Editor del dashboard o por el MCP de Supabase.

- [ ] **Step 3: Verificar que quedó aplicada (no confiar en el "success")**

```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='outreach_messages'
       and column_name='enviado_por') as tiene_enviado_por,
  (select pg_get_constraintdef(oid) from pg_constraint
     where conname='outreach_messages_estado_check') as regla_estado,
  (select count(*) from pg_indexes
     where indexname='idx_outreach_encolados') as tiene_indice;
```

Expected: `tiene_enviado_por=1`, la regla incluye **`encolado` y `enviando`**, `tiene_indice=1`

- [ ] **Step 4: Probar que el estado nuevo se acepta y uno inventado no**

```sql
-- Debe fallar con violacion de CHECK:
insert into outreach_messages (lead_id, canal, texto, estado)
select id, 'whatsapp', 'prueba', 'inventado' from fact_leads limit 1;
```

Expected: ERROR `violates check constraint "outreach_messages_estado_check"`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/041_buzon_whatsapp.sql
git commit -m "migracion 041: el buzon de salida de WhatsApp

outreach_messages no tenia un estado para 'encolado, todavia sin mandar' — solo
borrador/enviado/fallido — ni columna para saber quien del equipo lo mando.
Sin eso no se puede usar como buzon."
```

---

### Task 4: El CRM anota en el buzón en vez de llamar al puente

**Files:**
- Modify: `app/api/wa/send/route.ts` (desde `const bridgeUrl = procEnv.WA_BRIDGE_URL`, ~línea 69, hasta el final)

**Interfaces:**
- Consumes: estado `encolado` y `enviado_por` de la Task 3.
- Produces: filas en `outreach_messages` con `canal='whatsapp'`, `estado='encolado'`. Las consume la Task 5.
- El contrato con el frontend **no cambia**: mismo body `{ lead_id, telefono, texto, enviado_por }`. Cambia solo la respuesta: `202 { ok: true, encolado: true, id }`.

- [ ] **Step 1: Reemplazar la llamada HTTP por la inserción**

Reemplazar todo el bloque que empieza en `const bridgeUrl = procEnv.WA_BRIDGE_URL` por:

```typescript
  // El CRM ya no llama al puente: lo anota acá y el puente lo pasa a buscar.
  // El puente escucha en 127.0.0.1 del VPS — desde Vercel es inalcanzable, y
  // exponerlo pedía un túnel cuya dirección cambia en cada reinicio. Mismo
  // patrón que scraper_runs: si el puente está caído, esto queda encolado en
  // vez de perderse.
  const { data: encolado, error: errorEncolar } = await admin
    .from('outreach_messages')
    .insert({
      lead_id,
      canal: 'whatsapp',
      texto,
      estado: 'encolado',
      enviado_por: enviado_por.trim(),
      aprobado_por: perfil.id,
    })
    .select('id')
    .single()

  if (errorEncolar) {
    console.error('[api/wa/send] no se pudo encolar:', errorEncolar)
    return NextResponse.json(
      { error: 'No se pudo encolar el mensaje.' },
      { status: 500 }
    )
  }

  // 202 y no 200: el mensaje está aceptado, todavía no entregado.
  return NextResponse.json({ ok: true, encolado: true, id: encolado.id }, { status: 202 })
```

⚠️ `cliente_id` deja de estar soportado por este camino: `outreach_messages.lead_id` es NOT NULL. La validación de más arriba (`if (!lead_id && !cliente_id)`) se cambia por:

```typescript
  if (!lead_id) {
    return NextResponse.json(
      { error: 'Falta lead_id. El envío a clientes todavía no pasa por el buzón.' },
      { status: 400 }
    )
  }
```

- [ ] **Step 2: Sacar el import y la variable que ya no se usan**

Si `normalizarTelefono` y `numero` quedaron sin uso tras el cambio, borrarlos. El teléfono lo resuelve el puente desde el lead al momento de mandar.

⚠️ Ojo: el bloque que resuelve `telefono` desde `fact_leads` **sigue haciendo falta** como validación — si el lead no existe o no tiene teléfono, hay que rebotar antes de encolar. Conservarlo, y conservar el `404 Lead no encontrado` y el `400 Teléfono inválido`.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en `app/api/wa/send/route.ts`

- [ ] **Step 4: Verificar que el lint pasa**

Run: `npx eslint app/api/wa/send/route.ts`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/api/wa/send/route.ts
git commit -m "api/wa/send: anotar en el buzon en vez de llamar al puente

El puente escucha solo en 127.0.0.1 del VPS y el CRM vive en Vercel: nunca lo
alcanzo. Por eso 'Enviar desde el CRM' siempre fallo — y el mensaje que veia el
equipo ('aun no esta disponible') era correcto pero no decia por que.

Ahora se anota en outreach_messages y el puente lo pasa a buscar. Si el puente
esta caido, el mensaje espera en vez de perderse."
```

---

### Task 5: El puente vacía el buzón

**Files:**
- Modify: `wa-bridge/index.js` (ciclo nuevo, al final, antes de `server.listen`)
- Create: `wa-bridge/buzon.js` (la parte pura: decidir qué mandar)
- Test: `wa-bridge/buzon.test.js`

**Interfaces:**
- Consumes: filas de `outreach_messages` con `estado='encolado'` (Task 4); `estaPermitido` (Task 1).
- Produces: nada hacia otras tasks.

- [ ] **Step 1: Escribir el test de la parte pura**

```javascript
// wa-bridge/buzon.test.js
import { describe, it, expect } from 'vitest'
import { aJobDeEnvio } from './buzon.js'

const fila = {
  id: 'aaaaaaaa-0000-0000-0000-000000000000',
  lead_id: 'bbbbbbbb-0000-0000-0000-000000000000',
  texto: 'hola',
  enviado_por: 'Cristian',
}

describe('aJobDeEnvio', () => {
  it('arma el envio con el telefono del lead', () => {
    const job = aJobDeEnvio(fila, { telefono: '+56 9 1111 1111' })
    expect(job).toEqual({
      telefono: '56911111111',
      texto: 'hola',
      lead_id: fila.lead_id,
      cliente_id: null,
      es_bot: false,
      enviado_por: 'Cristian',
    })
  })

  it('sin lead no hay envio', () => {
    expect(aJobDeEnvio(fila, null)).toBeNull()
  })

  it('lead sin telefono no hay envio', () => {
    expect(aJobDeEnvio(fila, { telefono: null })).toBeNull()
  })

  it('telefono ilegible no hay envio', () => {
    expect(aJobDeEnvio(fila, { telefono: 'sin numero' })).toBeNull()
  })

  it('sin enviado_por queda una atribucion honesta, no un invento', () => {
    const job = aJobDeEnvio({ ...fila, enviado_por: null }, { telefono: '56911111111' })
    expect(job.enviado_por).toBe('CRM')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run wa-bridge/buzon.test.js`
Expected: FAIL — no existe `./buzon.js`

- [ ] **Step 3: Escribir la parte pura**

```javascript
// wa-bridge/buzon.js
//
// La decision de que mandar, separada del ciclo que habla con la base y con
// WhatsApp: es la parte que se puede equivocar en silencio (mandarle a un
// telefono mal leido) y la unica barata de probar.

function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/**
 * Traduce una fila encolada + su lead a un job de envio.
 * Devuelve null si NO se puede mandar (sin lead, sin telefono, telefono ilegible).
 */
export function aJobDeEnvio(fila, lead) {
  const telefono = soloDigitos(lead?.telefono)
  if (!telefono) return null
  return {
    telefono,
    texto: fila.texto,
    lead_id: fila.lead_id,
    cliente_id: null,
    es_bot: false,
    // 'CRM' y no el nombre de alguien: si no vino atribucion, se dice que salio
    // del sistema en vez de adjudicarsela a una persona que no la escribio.
    enviado_por: fila.enviado_por || 'CRM',
  }
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run wa-bridge/buzon.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Escribir el ciclo que vacía el buzón**

En `wa-bridge/index.js`, agregar el import arriba:

```javascript
import { aJobDeEnvio } from './buzon.js'
```

Y antes de `server.listen(PORT, ...)`:

```javascript
// ---------------------------------------------------------------------------
// El buzon: el CRM anota en outreach_messages y este ciclo lo pasa a buscar.
// El CRM corre en Vercel y este proceso escucha en 127.0.0.1 — no hay forma de
// que nos llame. Ver la migracion 041 y el diseno del 10-ago.
// ---------------------------------------------------------------------------
const BUZON_INTERVALO_MS = Number(env.WA_BRIDGE_BUZON_INTERVALO_MS || 10000)

async function vaciarBuzon() {
  if (!sesionLista) return

  // Una por vuelta: el envio real ya tiene su propio throttle de un mensaje por
  // minuto, no tiene sentido acumular aca.
  const { data: filas, error } = await supabase
    .from('outreach_messages')
    .select('id, lead_id, texto, enviado_por')
    .eq('estado', 'encolado')
    .eq('canal', 'whatsapp')
    .order('created_at')
    .limit(1)

  if (error) {
    console.error('[wa-bridge] no pude leer el buzon:', error)
    return
  }
  if (!filas || filas.length === 0) return

  const fila = filas[0]

  // Se RESERVA antes de mandar. Si se marcara despues, dos vueltas solapadas
  // (o un reinicio a mitad de camino) mandarian el mismo mensaje dos veces —
  // y un mensaje repetido a un cliente no se puede deshacer.
  //
  // 'enviando' y no 'enviado': todavia no salio, y decir que salio seria
  // mentir. Si el proceso muere aca, la fila queda trabada en 'enviando' — es
  // visible y se puede revisar, que es mucho mejor que un duplicado silencioso.
  const { data: tomada } = await supabase
    .from('outreach_messages')
    .update({ estado: 'enviando' })
    .eq('id', fila.id)
    .eq('estado', 'encolado')
    .select('id')
  if (!tomada || tomada.length === 0) return   // otra vuelta se lo llevo

  const { data: lead } = await supabase
    .from('fact_leads')
    .select('telefono')
    .eq('id', fila.lead_id)
    .single()

  const job = aJobDeEnvio(fila, lead)
  if (!job) {
    await supabase
      .from('outreach_messages')
      .update({ estado: 'fallido', error: 'el lead no tiene un telefono usable' })
      .eq('id', fila.id)
    console.warn(`[wa-bridge] buzon: ${fila.id} sin telefono usable`)
    return
  }

  if (!estaPermitido(job.telefono, SOLO_NUMEROS)) {
    await supabase
      .from('outreach_messages')
      .update({ estado: 'fallido', error: 'modo prueba: numero no autorizado' })
      .eq('id', fila.id)
    console.warn(`[wa-bridge] buzon: ${fila.id} bloqueado por modo prueba`)
    return
  }

  try {
    await new Promise((resolve, reject) => encolarEnvio({ ...job, resolve, reject }))
    // Recien AHORA salio de verdad.
    await supabase
      .from('outreach_messages')
      .update({ estado: 'enviado', enviado_at: new Date().toISOString() })
      .eq('id', fila.id)
    console.log(`[wa-bridge] buzon: ${fila.id} enviado a ${job.telefono}`)
  } catch (err) {
    await supabase
      .from('outreach_messages')
      .update({ estado: 'fallido', error: String(err?.message || err) })
      .eq('id', fila.id)
    console.error(`[wa-bridge] buzon: fallo ${fila.id}:`, err)
  }
}

setInterval(() => {
  vaciarBuzon().catch((err) => console.error('[wa-bridge] vuelta del buzon fallida:', err))
}, BUZON_INTERVALO_MS)
```

- [ ] **Step 6: Verificar que el archivo es válido y toda la batería pasa**

Run: `node --check wa-bridge/index.js && npx vitest run`
Expected: sin errores, todos los tests PASS

- [ ] **Step 7: Commit**

```bash
git add wa-bridge/buzon.js wa-bridge/buzon.test.js wa-bridge/index.js
git commit -m "wa-bridge: vaciar el buzon que escribe el CRM

Se marca la fila ANTES de mandar: si se marcara despues, dos vueltas solapadas
o un reinicio a mitad de camino mandarian el mismo mensaje dos veces, y un
mensaje repetido a un cliente no se deshace.

La decision de que mandar vive aparte (buzon.js) con sus tests: es la parte que
se equivoca en silencio."
```

---

### Task 6: Desplegar, vincular y probar de punta a punta

Esto no es código: es lo que decide si lo anterior sirve. **Va en este orden.**

**Files:** ninguno (operativo, en `179.197.224.95`)

- [ ] **Step 1: Subir la rama y abrir el PR**

```bash
git push origin feat/whatsapp-dentro-del-crm
gh pr create --repo TryvexTeam/TryvexPlataform --base main \
  --head feat/whatsapp-dentro-del-crm \
  --title "WhatsApp dentro del CRM — Fase 1: la cañería"
```

- [ ] **Step 2: Desplegar el puente al VPS**

```bash
scp -i ~/.ssh/ariel_hetzner wa-bridge/index.js wa-bridge/permitidos.js wa-bridge/buzon.js \
  root@179.197.224.95:/tmp/
ssh -i ~/.ssh/ariel_hetzner root@179.197.224.95 \
  "cp /tmp/index.js /tmp/permitidos.js /tmp/buzon.js /opt/wa-bridge/ && \
   chown bridge:bridge /opt/wa-bridge/*.js && node --check /opt/wa-bridge/index.js && echo OK"
```

- [ ] **Step 3: Poner el modo prueba ANTES de vincular**

⚠️ **Este paso va antes del QR, sin excepción.** Vincular primero significa que cada mensaje personal que le llegue a Cristian queda guardado en la base de la empresa.

```bash
ssh -i ~/.ssh/ariel_hetzner root@179.197.224.95 \
  "grep -q WA_BRIDGE_SOLO_NUMEROS /opt/wa-bridge/.env || \
   echo 'WA_BRIDGE_SOLO_NUMEROS=<NUMERO_DE_CRISTIAN>' >> /opt/wa-bridge/.env; \
   systemctl restart tryvex-wa-bridge; sleep 5; \
   journalctl -u tryvex-wa-bridge -n 5 --no-pager -o cat"
```

Expected: en el log aparece `MODO PRUEBA: solo se atienden 1 numero(s)`

- [ ] **Step 4: Verificar el modo prueba con los ojos, no con fe**

Si NO aparece la línea de MODO PRUEBA, **parar acá**: el filtro no está activo y no se puede vincular.

- [ ] **Step 5: Vincular el WhatsApp de Cristian**

Sacar el QR del puente y hacérselo llegar como imagen. Cristian escanea desde
**WhatsApp → Dispositivos vinculados → Vincular dispositivo**.

Verificar después:

```bash
ssh -i ~/.ssh/ariel_hetzner root@179.197.224.95 "curl -s http://127.0.0.1:4600/health"
```

Expected: `{"ok":true,"sesionLista":true,...}`

- [ ] **Step 6: Desplegar el CRM**

El PR de la Task 6 Step 1 dispara el preview de Vercel. Verificar que compila antes de seguir.

- [ ] **Step 7: LA PRUEBA — de punta a punta**

1. Crear (o elegir) un lead cuyo teléfono sea el de Cristian.
2. Desde el CRM, apretar "Enviar desde el CRM".
3. **Cristian confirma que el mensaje le llegó al celular.**
4. Cristian responde desde el celular.
5. **La respuesta aparece en el hilo del CRM.**

Verificar en la base:

```sql
select estado, enviado_por, error, enviado_at from outreach_messages order by created_at desc limit 3;
select direccion, texto, enviado_por, created_at from mensajes_wa order by created_at desc limit 5;
```

Expected: la salida en `estado='enviado'`; en `mensajes_wa` una fila `out` y una `in`.

- [ ] **Step 8: Probar que la lista blanca de verdad protege**

Desde otro teléfono **que no sea el de Cristian**, mandarle un WhatsApp a su número.

```sql
select count(*) from mensajes_wa where created_at > now() - interval '5 minutes';
select count(*) from fact_leads where created_at > now() - interval '5 minutes';
```

Expected: **ninguna fila nueva por ese mensaje**. Si aparece, el filtro no funciona: sacar la vinculación de inmediato (`WhatsApp → Dispositivos vinculados → cerrar sesión`) y volver a la Task 2.

- [ ] **Step 9: Anotar el resultado en el PR**

Escribir en el PR qué se probó y qué se vio — incluido el Step 8, que es la garantía de privacidad.

---

## Notas para quien ejecute

- **Si el Step 8 falla, todo lo demás no importa.** Es la única prueba que protege a una persona, no a un sistema.
- El `.env` del puente **no** está en git y **no** debe subirse.
- El puente tiene `Restart=always`: para probar que revive, `kill -9` al PID y verificar que vuelve.
- Repo y VPS estaban idénticos al 10-ago (mismo md5 de `index.js`). Si divergieron, resolverlo **antes** de desplegar: pisar el servidor con una versión vieja borraría trabajo de otro.
- El `wa.me` del `lead-panel.tsx` se saca en la **Fase 2**, no en ésta.
