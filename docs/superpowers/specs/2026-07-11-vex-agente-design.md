# Vex (scraper-clientes) — agente de outreach dentro de TryvexPlataform

**Fecha:** 2026-07-11 · **Rama:** `feat/vex-agente` · **Autores:** Cristian + Ariel (Claude)

## Objetivo

Fusionar las capacidades del `leads-dashboard` (Railway, hoy caído) dentro de TryvexPlataform:
un agente conversacional llamado **Vex (scraper-clientes)** con el que el equipo gestiona la
cartera de leads, genera mensajes personalizados y **envía WhatsApp** a los leads elegidos,
siempre con aprobación humana. Un solo sistema, una sola base de datos, un solo deploy (Vercel).

## Contexto y decisiones tomadas

- **Base = TryvexPlataform** (`TryvexTeam/TryvexPlataform`, Vercel `tryvexplataform.vercel.app`,
  Supabase `tryvex-migracion` / `kmqozwcwttafvwhqlhkq`). Es donde el equipo vive.
- **BD única (decisión A):** los 308 leads del Supabase viejo (`tryvex-leads` /
  `spztucwmdyzulpldfzha`, cuenta B) se migran a `fact_leads` del CRM. La BD vieja queda de
  respaldo, sin tocar.
- **leads-dashboard en Railway está caído (404 total)** — no se resucita; su código se porta.
- **Un solo agente en V1:** `Vex (scraper-clientes)`. `Vex (General)` (personal por miembro,
  con API key propia) queda para una fase 2 con su propio diseño.
- **Canal = WhatsApp:** el dataset son negocios sin web → 308/309 tienen teléfono, ~0 email.
  El outreach por correo fue un error de canal. Redes sociales: futuro.
- **Motor LLM = Groq** (`llama-3.3-70b-versatile`, verificado vivo el 11-jul con la key real).
- **Trabajo en rama `feat/vex-agente`** con commits explicativos y PR final para revisión del
  equipo. Nada directo a `main`.

## Arquitectura

### 1. Datos y migración

Migración SQL `supabase/migrations/012_vex_outreach.sql`:

- **`outreach_messages`**: `id` UUID, `lead_id` UUID FK→`fact_leads`, `canal`
  (`whatsapp|email|social`), `texto`, `estado` (`borrador|enviado|fallido`), `aprobado_por`
  UUID FK→`dim_integrantes`, `wa_message_id` TEXT NULL, `error` TEXT NULL, timestamps.
  RLS on (equipo autenticado lee; escribe el server con service role).
- **`vex_conversaciones`**: `id` UUID, `integrante_id` FK, `rol` (`user|vex`), `texto`,
  `created_at`. Historial del chat por integrante. RLS: cada integrante ve lo suyo.

Script one-shot `scripts/migrar-leads-viejos.ts`:

- Lee `fact_leads` del proyecto viejo (cuenta B) con sus keys (solo lectura).
- Mapea columnas al schema del CRM (`comuna`→`localidad`, `origen='scraper'`,
  `estado='sin_contactar'`; id numérico → UUID nuevo).
- **Dedupe** por `nombre_negocio` normalizado + `telefono` contra lo ya existente.
- Reporte final: insertados / duplicados saltados / errores. Idempotente (re-correrlo no duplica).

### 2. Sección `/vex` (UI)

- `app/(app)/vex/page.tsx` + componentes en `components/vex/`, siguiendo el estilo del CRM
  (shadcn new-york, patrones de layout existentes).
- Chat con Vex: burbujas, historial persistido (`vex_conversaciones`), input con envío.
- Cuando Vex propone un envío: **tarjetas de borrador por lead** (texto editable, canal,
  teléfono) con botones **"Aprobar y enviar"** / **"Simular (dry-run)"** / descartar.
- Header con selector de agente (hoy solo `Vex (scraper-clientes)`; preparado para más).

### 3. Cerebro de Vex — `lib/vex/`

Port de los services del trybot, adaptados a las tablas del CRM:

- `llm.ts`: cliente Groq perezoso, `llmJSON`/`llmTexto`, reintentos ante 429/503/timeout,
  override por env `VEX_MODEL`.
- `cartera.ts`: reporte por estado, listar, recomendar leads con contacto por score, marcar
  estado (estados del kanban del CRM, incl. won/lost de la migración 003).
- `draft.ts`: copy PAS personalizado por lead (el prompt probado del leads-dashboard),
  enfocado a `whatsapp_text`; `social_text` se genera solo si el lead tiene redes.
- `batch.ts` + `intenciones`: clasificar orden natural → `reporte | recomendar | marcar |
  preparar_envio | conversar` (patrón clasificar→ejecutar→responder del trybot).
- API: `/api/vex/chat` (auth de sesión del CRM; historial; tope 5 acciones por turno).
- La key de Groq va en env del proyecto (`GROQ_API_KEY`). Keys por miembro: fase 2.

### 4. WhatsApp Cloud API

- `lib/vex/whatsapp.ts` + `/api/vex/whatsapp/send` (port del código dormido del dashboard):
  - Primer contacto en frío = **plantilla `primer_contacto` aprobada por Meta** (regla de Meta;
    texto libre solo dentro de la ventana de 24 h tras respuesta del lead).
  - Guardias: requiere `confirmar: true`, rate-limit, idempotente por lead+plantilla,
    registra en `outreach_messages`, marca lead contactado y crea `interacciones_lead`
    (aparece en el timeline que el equipo ya usa).
  - Env en Vercel: `WHATSAPP_TOKEN` (system user), `WHATSAPP_PHONE_NUMBER_ID`.
- **Fallback sin plantilla aprobada:** botón que abre `wa.me/<numero>?text=<borrador
  personalizado>` para envío manual → la feature sirve desde el día 1.
- **Primera prueba de envío real SIEMPRE al número de Cristian**, nunca a un lead.

### 5. Scraper

- `scrapper-tryvex` (Python, corre donde siempre) pasa a postear al webhook **existente**
  del CRM: `/api/webhook/scraper` con `SCRAPER_WEBHOOK_SECRET`. Solo cambia URL/secret en su env.
- Vex NO ejecuta el scraper en V1; trabaja los leads que entran por el webhook.

### 6. Manejo de errores

- LLM caído/limitado: mensaje claro en el chat ("Groq sin cuota, reintentá en un rato"),
  nunca silencio ni spinner infinito (la lección del "no me carga").
- Envío fallido: `estado='fallido'` + `error` guardado, visible en la tarjeta y el timeline.
- Webhook y send: validación Zod + códigos HTTP correctos (401/400/429).

### 7. Testing y verificación

- Unit: intenciones del chat, dedupe del script de migración, guardia `confirmar:true`,
  construcción del link `wa.me`, mapeo de columnas.
- `tsc --noEmit` + `npm run build` verdes en cada task.
- E2E en el deploy de preview de Vercel de la rama: chat responde reporte real, borrador
  se genera, dry-run registra sin enviar.
- Envío real: solo plantilla al número de Cristian.

## Fuera de alcance (V1)

- `Vex (General)` y API keys por miembro (fase 2, diseño propio).
- Envío por correo/redes sociales (borradores sí, envío no).
- Ejecutar el scraper desde el chat.
- Instagram API, métricas de campañas, deliverability.

## Pendientes externos (Cristian)

1. Crear app en Meta Business + dar de alta el número → `WHATSAPP_TOKEN` y
   `WHATSAPP_PHONE_NUMBER_ID` (Ariel guía; la aprobación de la plantilla puede tardar días —
   dispararla temprano, no bloquea el resto).
2. Pasar a Ariel las keys de lectura del Supabase viejo para la migración de leads
   (ya están en `leads-dashboard/.env.local`).
3. Avisar al equipo del PR cuando esté listo.
