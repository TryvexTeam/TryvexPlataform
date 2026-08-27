# PRP-009: Vex en el CRM — QR, chat con leads, agente en el VPS y Tryvex Intelligence

> **Estado**: PENDIENTE
> **Fecha**: 2026-08-27
> **Proyecto**: Tryvex App (CRM)

---

## Objetivo

Cerrar las cuatro metas que faltan para que Vex deje de ser un chat aislado y
pase a ser el agente operativo del CRM: (1) vincular el WhatsApp del equipo
escaneando el QR desde Configuración, (2) que Vex cargue el mensaje directo en
el chat del lead y sepa quién respondió, (3) que el agente corra 24/7 en el VPS
con su token y su estado visible desde el CRM, y (4) un panel **Tryvex
Intelligence** que muestre lo que el agente sabe y lo que hizo.

**Nota de encuadre — esto es conectar y ampliar, no construir de cero.** La
auditoría del repo (ver Contexto) muestra que buena parte de las metas 1-3 ya
tiene código en `main`. El riesgo real de este PRP no es escribir features: es
**dar por hecho que algo funciona porque el archivo existe**. Cada fase abre con
una verificación del efecto en producción, no del código.

> ### 🔴 Bloqueante duro — leer antes que nada
>
> **No se vincula ningún chip nuevo hasta cerrar la Fase 0.** En agosto de 2026
> WhatsApp baneó dos números de Tryvex (`Vex-Agente/errores-sesion.md #24`). El
> post-mortem del propio equipo concluyó que **la reputación vive en la IP del
> datacenter, no en el número ni en el contenido**: el segundo número murió a los
> minutos del primer intercambio, desde la misma IP ya marcada. Cambiar de
> proveedor de VPS no cambia la variable.
>
> Consecuencia para este PRP: todas las metas dependen de un transporte de
> WhatsApp vivo, y hoy ese transporte se quema solo. Ejecutar las fases 2-6 sobre
> la infraestructura actual es construir sobre un número que se va a caer.
>
> **El chip es `+56950358818`** — el número de Tryvex, confirmado por el señor
> Ignacio (27-ago) como el que va a escanear el QR cuando todo esté listo. Es el
> mismo que ya vive en el sistema como `WA_BRIDGE_CHIP_ID=tryvex-56950358818` y
> cuyo valor viaja a `mensajes_wa.chip_id`. **No es un chip de repuesto: es el
> número comercial de la empresa.** Perderlo no es perder una prueba, es perder
> el canal por donde ya se habló con leads reales. Esa es la razón por la que la
> Fase 0 no se puede saltar «solo para probar».

## Por Qué

| Problema | Solución |
|---|---|
| Quien tiene el chip de Tryvex no está en la máquina del VPS, así que vincular WhatsApp exigía coordinación manual y compartir un token por chat | QR remoto servido desde `/settings/whatsapp`, con el token del bridge resuelto solo en el servidor |
| Vex redacta un mensaje excelente y termina en `wa.me` — saca al equipo de la plataforma y pierde la trazabilidad | El borrador de Vex se carga en el hilo del lead dentro del CRM; envía una persona, desde ahí |
| Nadie sabe si el agente está vivo: si el proceso del VPS se cae, se descubre cuando un lead no recibe el mensaje | Agente con token propio, heartbeat y estado consultable desde el CRM |
| Los datos del agente (qué redactó, quién respondió, cuánto se envió) no se ven en ningún lado | Panel Tryvex Intelligence: actividad de Vex y salud de la integración, en una sola vista |

**Valor de negocio**: outreach que no se sale de la plataforma (trazabilidad de
quién habló con quién), caída del bridge detectada en minutos y no en días, y
una vista única para decidir sobre la cartera sin abrir la base.

## Qué

### Criterios de Éxito

- [ ] Un integrante activo entra a `/settings/whatsapp` **en producción**, ve el
      QR real del bridge del VPS y al escanearlo el estado pasa a `conectado`
      sin recargar (el polling lo detecta).
- [ ] `WA_BRIDGE_URL` y `WA_BRIDGE_QR_TOKEN` están configuradas en Vercel para
      el proyecto del CRM, y `GET /api/wa/health` responde `sesionLista: true`.
- [ ] Desde `/vex`, pedir "escribile a [negocio]" deja el borrador **cargado en
      el hilo del lead** (`components/leads/lead-chat-wa.tsx`), sin enviarlo y
      sin abrir `wa.me`.
- [ ] Vex responde correctamente a "¿quiénes respondieron?" listando leads con
      mensaje entrante posterior al último saliente.
- [ ] Existe un tope de volumen de salientes por día verificable: superado el
      tope, el envío se rechaza con un mensaje claro (mitigación del riesgo de
      ban de `whatsapp-web.js`).
- [ ] El agente corre en el VPS bajo systemd con usuario propio y `MemoryMax`;
      un `systemctl restart` real lo devuelve a `sesionLista: true` solo.
- [ ] `/intelligence` muestra, con datos reales: estado del puente, salientes y
      entrantes de los últimos 7 días, leads que respondieron, borradores
      generados por Vex y último latido del agente.
- [ ] `npm run build` y `npm run lint` pasan sin errores nuevos.

### Comportamiento Esperado

**Vinculación.** Cristian entra logueado al CRM desde su teléfono o notebook,
va a Configuración → WhatsApp del equipo, ve el QR (renovado cada ~15s por el
polling), lo escanea con el teléfono del número de Tryvex y la tarjeta pasa a
"Ya está vinculado". El token del bridge nunca llega al navegador.

**Redacción y envío.** En `/vex`, el operador pide un mensaje para un lead. Vex
usa los datos reales del negocio (nicho, localidad, `tiene_web`, `info_texto`) y
devuelve un borrador. El operador lo revisa, lo corrige si quiere y aprieta
enviar **desde el chat del lead**. El mensaje sale por el buzón → puente → VPS,
queda registrado en `mensajes_wa` con la autoría del integrante (nunca "Equipo"),
y el lead avanza a `contactado` con la asignación automática del PRP-008.

**Respuestas.** El operador pregunta a Vex "¿quiénes respondieron?" y recibe la
lista de leads con entrante pendiente. Vex **no** redacta la respuesta: la
conversación la lleva una persona (decisión de Cristian, 17-ago).

**Vigilancia.** El heartbeat del VPS reporta al CRM. Si el puente se cae, el
panel Intelligence lo muestra en rojo y el aviso llega por Discord.

---

## Contexto

### Lo que YA existe en `main` (auditado 2026-08-27 — no rehacer)

| Pieza | Dónde | Estado |
|---|---|---|
| Estado tipado del QR del bridge | `lib/wa/qr.ts` (`obtenerEstadoQr`) | Completo, con 6 estados y token solo-servidor |
| Endpoint de refresco del QR | `app/api/wa/qr/route.ts` | Completo, exige integrante activo |
| UI de vinculación | `components/settings/whatsapp-vinculacion.tsx` | Completa: polling 15s, primer QR desde el servidor, estados de error |
| Entrada en Configuración | `app/(app)/settings/page.tsx` | Enlace a `/settings/whatsapp` ya presente |
| Salud del puente | `app/api/wa/health/route.ts`, `lib/wa/no-leidos.ts` | Existe |
| Puente WhatsApp | `wa-bridge/` (`index.js`, `heartbeat.js`, `ecosystem.config.cjs`) | Código y `DEPLOY.md`/`ENV-SETUP.md` completos |
| Motor LLM de Vex | `lib/vex/llm.ts` | Groq, con fallback de modelo por env (`VEX_MODEL`, `VEX_MODEL_FALLBACK`) |
| Redacción por lead | `lib/vex/draft.ts`, `app/api/vex/redactar/route.ts` | Devuelve solo texto: no envía, no guarda |
| Intenciones y cartera | `lib/vex/intenciones.ts`, `lib/vex/cartera.ts` | `reporte`, `recomendar`, `marcar`, `preparar_envio`, `conversar` |
| RAG | `lib/vex/rag.ts`, `lib/vex/embeddings.ts` | `buscar_conocimiento` (Hormozi + docs + reuniones) |
| Chat de Vex y del lead | `components/vex/vex-chat.tsx`, `components/leads/lead-chat-wa.tsx` | Ambos existen |
| Envío por el buzón | `app/api/wa/send/route.ts` | Autoría desde la sesión, resuelve teléfono en el servidor |
| Identidad de agentes | `app/api/agentes/*`, `lib/agentes/token.ts`, `lib/agentes/rate-limit.ts` | Token hasheado, TTL 90 días, 60 req/min en memoria |
| Deck y KPIs del dashboard | `components/dashboard/*`, `lib/types/dashboard.ts` | Patrón de vitrinas a reutilizar en Intelligence |

### El repo hermano: `Vex-Agente` (fuera de este repositorio)

**Este PRP no se puede ejecutar mirando solo el CRM.** El agente conversacional
vive en `TryvexTeam/Vex-Agente` (local: `~/Documents/GitHub/Vex-Agente`, HEAD
`12a893a`), un Next.js 16 propio con su SQLite, su panel y su transporte. Lo que
el CRM llama «Vex» (`lib/vex/*`) es el redactor de borradores; lo que conversa,
califica y agenda es el otro repo.

| Pieza en `Vex-Agente` | Qué aporta a este PRP |
|---|---|
| `src/lib/baileys/client.ts` | Transporte Baileys. **Ya tiene el freno del 403** (`:221`): `forbidden \|\| 419` marca `posible_baneo` y para en seco, sin reintentar ni sacar QR nuevo |
| `src/app/api/connection/status/route.ts` | **Devuelve el QR ya renderizado en PNG base64.** Es la pieza que le falta a la Meta 1 |
| `src/app/api/mode/[conversationId]/route.ts` | Toggle `AI`/`HUMAN` por conversación — la Meta 4 pide exactamente esto |
| `src/lib/db.ts` (tabla `settings`) | Ajustes leídos **en caliente**, sin reiniciar: `model`, `temperature`, `paused`, `buffer_seconds`, `audio_enabled`, `transcription_model` |
| `src/lib/humanize.ts`, `guardrails.ts` | Delay proporcional, mensajes partidos, precios y hosts permitidos, canario anti-fuga |
| `src/lib/crm-context.ts`, `crm-eventos.ts` | **El puente al CRM ya está escrito y configurado**: consume `/api/agentes/*` con `Bearer txa_…` y agenda por el CRM antes que por Google Calendar |
| `src/proxy.ts` | ⚠️ Solo acepta cookie de dashboard: un agente con Bearer recibe **401**. Hay que aceptar `TRYVEX_AGENT_TOKEN` o el CRM no puede leer el QR |
| `errores-sesion.md` | 24 incidentes documentados con causa y corrección. El `#24` es el baneo |

### Los tres transportes de WhatsApp (hallazgo que ordena el PRP)

Hoy coexisten **tres** implementaciones del mismo trabajo:

| Transporte | Dónde | Vía | Estado |
|---|---|---|---|
| Baileys | `Vex-Agente/` | No oficial, con QR | Completo, con freno de 403. Sin desplegar contra el CRM |
| `whatsapp-web.js` | `wa-bridge/` en este repo | No oficial, con QR | Vivo 24/7 en el VPS. Escucha en `127.0.0.1`. **Sin freno de baneo** |
| Meta Cloud API | `lib/vex/whatsapp.ts` | Oficial, sin QR | Escrito, con tests, **sin un solo consumidor**. Código muerto |

Dos consecuencias operativas:

1. **WhatsApp permite 4 dispositivos vinculados.** Ariel lo dejó anotado en
   `#chatia`: el puente ocupa uno. Si Vex-Agente se conecta al mismo número sin
   retirar el puente, son **dos sesiones automatizadas simultáneas** — duplica la
   huella y los ecos entrantes. Hay que elegir un transporte, no sumar.
2. **El QR del CRM apunta al transporte equivocado.** `lib/wa/qr.ts` consulta al
   puente, que escucha en loopback y desde Vercel es inalcanzable. Vex-Agente ya
   sirve ese QR listo — repuntar es más barato que exponer el puente.

### Referencias de diseño ya escritas

- `docs/superpowers/specs/2026-08-17-vex-conectado-al-chat-design.md` — **diseño
  aprobado, sin implementar**. Contiene las tres decisiones que ordenan la meta 2:
  Vex nunca envía · solo primer contacto · todo sale por el puente, no por Meta.
- `docs/superpowers/plans/2026-08-10-whatsapp-crm-fase1.md`
- `wa-bridge/DEPLOY.md` — el VPS es **casa temporal** (condición de Cristian):
  usuario Linux propio, systemd separado, `MemoryMax` propio, y el cerebro de
  cada agente NO vive ahí.
- `cerebro/index.md` y `cerebro/log.md` — incluye la regla nacida del incidente
  de la FK duplicada (embed ambiguo → 500 en el calendario de producción).

### Arquitectura Propuesta

```
lib/vex/
├── respuestas.ts        — quién respondió (entrante posterior al último saliente)
├── topes.ts             — tope diario de salientes (mitigación de ban)
└── (existente: llm, draft, cartera, intenciones, rag, telefono, whatsapp)

lib/repos/
└── intelligence.ts      — agregados del panel (Repository Pattern obligatorio)

lib/types/
└── intelligence.ts      — tipos del panel

app/api/
├── vex/cargar-borrador/route.ts   — deja el draft en el hilo del lead (no envía)
├── agentes/latido/route.ts        — heartbeat del VPS (token de agente)
└── intelligence/route.ts          — datos del panel

app/(app)/intelligence/page.tsx
components/intelligence/           — reutiliza el lenguaje visual de components/dashboard/
```

### Modelo de Datos (propuesto — a confirmar en Fase 4)

```sql
-- Borrador de Vex cargado en el hilo del lead, todavía sin enviar.
CREATE TABLE vex_borradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES fact_leads(id) ON DELETE CASCADE,
  integrante_id UUID REFERENCES dim_integrantes(id),
  texto TEXT NOT NULL,
  enviado_mensaje_id UUID,        -- se completa cuando una persona lo manda
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Latidos del agente en el VPS.
CREATE TABLE agente_latidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  estado TEXT NOT NULL,           -- 'ok' | 'degradado' | 'caido'
  detalle JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

> ⚠️ **Antes de tocar el schema, releer el aprendizaje de la FK duplicada**:
> toda FK nueva hacia una tabla ya referenciada se nombra explícitamente, o
> PostgREST devuelve 500 en los embeds.

---

## Blueprint (Assembly Line)

> Solo FASES. Las subtareas se generan al entrar a cada fase con `/bucle-agentico`.

### Fase 0: Elegir transporte y dejar de quemar números 🔴 BLOQUEANTE
**Objetivo**: cerrar la causa raíz antes de tocar cualquier meta. Tres entregas:
(a) **proxy residencial o móvil** contratado y pasado como `agent` a
`makeWASocket` en `Vex-Agente/src/lib/baileys/client.ts:140` — hoy el socket sale
por la IP del datacenter, sin proxy, que es la variable que mató a los dos
números; (b) **decidir el transporte único** y retirar los otros, respetando el
límite de 4 dispositivos; (c) **poblar la lista blanca** `WA_BRIDGE_SOLO_NUMEROS`
antes de vincular — vacía significa sin filtro, y el puente crea una ficha de
lead con cualquier número desconocido que escriba.
**Validación**: el socket sale por la IP del proxy, verificado contra un servicio
de eco de IP desde el propio proceso — no desde el shell del servidor, que puede
tener otra ruta. Un solo transporte activo, confirmado por la lista de
dispositivos vinculados en el teléfono. Lista blanca poblada y desplegada.
**No se escanea el QR de `+56950358818` hasta que las tres estén verdes.**

### Fase 1: Verificar el estado real de las cuatro metas
**Objetivo**: separar lo que existe en el repo de lo que funciona en producción.
Comprobar env vars en Vercel, si el bridge del VPS está arriba, qué PRs quedaron
sin mergear y qué migraciones están sin aplicar. Sale un cuadro de brechas real
que puede recortar fases enteras.
**Validación**: cuadro escrito con, por cada meta, la evidencia observada
(respuesta HTTP, salida de `systemctl`, valor de env en Vercel) — nunca "el
archivo existe".

### Fase 2: Meta 1 — QR de WhatsApp operativo en Configuración
**Objetivo**: cerrar la brecha que deje la Fase 1 (configurar el entorno,
desplegar lo pendiente, corregir lo que falle). Si el código ya está entero, esta
fase es despliegue y verificación, no desarrollo.
**Validación**: escaneo real desde `/settings/whatsapp` en producción → el estado
pasa a `conectado` solo, y `/api/wa/health` lo confirma.

### Fase 3: Meta 2 — Vex carga el mensaje en el chat del lead
**Corrección de estado (27-ago).** La spec del 17-ago dice «diseño aprobado, sin
implementar», pero **eso describe al documento, no al código**: el chat ya está
construido y montado. `components/leads/lead-chat-wa.tsx` está renderizado en
`components/leads/lead-panel.tsx:595`, llama a `/api/vex/redactar` en `:96` para
cargar el borrador y a `/api/wa/send` en `:214` para enviar, con la autoría
resuelta desde la sesión y sin pisar lo que la persona esté tecleando. La regla
de Cristian —Vex redacta, envía un humano— ya está implementada tal cual.
**No rehacer esta fase: verificarla.**
**Objetivo**: lo que sí falta del diseño del 17-ago — "quiénes respondieron" y el
tope de volumen diario. Eliminar el camino de envío automático de
`TarjetaBorrador` si sigue vivo (el diseño **saca** código).
**Validación**: pedir un mensaje en `/vex` deja el borrador en el hilo del lead
sin enviarlo; preguntar "quiénes respondieron" devuelve la lista correcta contra
datos reales; superar el tope devuelve rechazo explicado.

### Fase 4: Meta 3 — Agente conectado al VPS
**Objetivo**: agente dado de alta con token, corriendo en el VPS con usuario
propio, systemd y `MemoryMax`, reportando latido al CRM. Migraciones con FKs
nombradas.
**Validación**: `systemctl restart` real del servicio → vuelve solo a
`sesionLista: true`; el último latido llega al CRM en menos de un ciclo; una
migración aplicada y verificada en transacción revertida.

### Fase 4b: Vex responde dentro de la conversación abierta
**Objetivo**: implementar la regla del 27-ago. Vex atiende **solo** conversaciones
donde el lead ya respondió al primer contacto humano; no existe ningún camino por
el que escriba primero. Requiere: el mapeo lead↔conversación por teléfono
normalizado (`lib/vex/telefono.ts` ya lo hace), que las respuestas entrantes
lleguen al agente, y que `ALLOWED_PRICES`/`ALLOWED_HOSTS` estén poblados **antes**
del primer arranque — son `const` de módulo, en caliente no toman efecto
(`errores-sesion.md #22`).
**Validación**: con un lead de prueba, el primer mensaje sale solo apretando un
humano; la respuesta del lead dispara a Vex; una pregunta de precio con cifra
fuera de la lista blanca **bloquea la respuesta** y sale el mensaje neutro. Y el
control negativo, que es el que importa: un lead que **nunca** respondió no
recibe absolutamente nada del agente, verificado dejando pasar la ventana de
seguimiento completa.

### Fase 5: Meta 4 — Panel Tryvex Intelligence
**Objetivo**: `/intelligence` con estado del puente, actividad de Vex, salientes
y entrantes de 7 días, leads que respondieron y salud del agente. Reutiliza el
lenguaje visual de `components/dashboard/`, no inventa dirección estética.
**Validación**: screenshot con datos reales; cada cifra reconciliada contra una
consulta directa; sin `Cache-Control: public` en nada autenticado.

### Fase 6: Validación Final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `npm run build` y `npm run lint` sin errores nuevos
- [ ] Playwright screenshot de `/settings/whatsapp`, `/vex`, `/leads/[id]` y `/intelligence`
- [ ] Los 8 criterios de éxito verificados con evidencia
- [ ] Un PR por cambio, ninguno directo a `main`

---

## Preguntas abiertas (responder antes de aprobar)

1. **Meta 1** — ¿el QR falla hoy en producción, o simplemente nunca se probó
   desde que se construyó? La respuesta decide si la Fase 2 es un fix o un
   despliegue.
2. **Meta 3** — "agente conectado al VPS": ¿es el `wa-bridge` que ya está ahí, o
   se quiere mover el **runtime de Vex** (el LLM y sus intenciones) al VPS para
   que opere sin que nadie tenga el CRM abierto?
3. **Meta 4** — ¿"Tryvex Intelligence" es un panel de **observabilidad del
   agente** (lo que asume este PRP) o un panel de **inteligencia comercial**
   (KPIs de cartera, scoring, oportunidades)? Son dos productos distintos.
4. **Tope de volumen** — ¿cuántos primeros contactos por día son aceptables?
   Sin número, el tope no se puede implementar.

5. ✅ **RESUELTA (27-ago, señor Ignacio) — Vex responde, pero nunca inicia.**

   > *«El primer mensaje lo enviamos nosotros desde el CRM, y luego si nos
   > responden, el agente responde.»*

   **El reparto queda así, y es la regla que gobierna todo el PRP:**

   | Momento | Quién actúa |
   |---|---|
   | Primer contacto al lead | **Una persona**, desde el chat del CRM. Vex redacta el borrador, el humano lo revisa y aprieta enviar |
   | El lead responde | **Vex**, dentro de la conversación ya abierta |
   | En cualquier momento | El humano toma el control con el toggle `HUMAN` |

   **Por qué esto cierra el conflicto en vez de saltárselo:** la decisión #1 de
   Cristian —*«Vex nunca envía. Siempre aprieta una persona»*— queda **intacta**,
   porque el envío en frío sigue siendo humano. Lo único que cambia es la #2, y
   cambia para el caso que Cristian no estaba evaluando: responderle a alguien
   que ya está conversando con nosotros.

   **Efecto sobre el riesgo de baneo — es una mejora, no una concesión.** El
   agente pasa a ser **puramente reactivo**: no existe ningún camino por el que
   escriba a alguien que no escribió primero. Ese es justamente el patrón que
   toda la documentación de la vía no oficial señala como seguro, y desactiva la
   objeción #1 de la crítica adversarial: no hay mensajería automatizada saliente
   que detectar, hay respuestas dentro de conversaciones abiertas por el otro
   lado. Con esto, la exposición vuelve a concentrarse donde ya sabíamos: la IP.

   **Lo que sigue pendiente del reparo de Cristian.** Su razón para el «no»
   —*«contestar implica precios y plazos que alguien tiene que cumplir»*— no
   desaparece: sigue siendo cierto que Vex va a hablar de plata. La mitigación ya
   existe en `Vex-Agente/src/lib/guardrails.ts`: cualquier cifra que no esté en
   `ALLOWED_PRICES` **bloquea la respuesta entera** y el lead recibe el mensaje
   neutro de `GUARD_FALLBACK_MSG`. Requisito que esto agrega: **poblar
   `ALLOWED_PRICES` y `ALLOWED_HOSTS` antes del primer arranque**, incluyendo las
   cifras derivadas que Vex pueda mencionar (el mensual de un plan anual, un pago
   fraccionado). El incidente `#20` de `errores-sesion.md` es exactamente esto:
   la lista se puebla con lo que el agente va a **decir**, no con el catálogo.
   Y el `#22` avisa que esas variables son `const` de módulo: **cargarlas antes
   de arrancar, porque en caliente no toman efecto sin reiniciar.**

   Queda una sola cosa que conviene conversar con Cristian, no decidir por él:
   que Vex conteste preguntas de precio con la lista blanca puesta. No es una
   objeción, es cortesía con el socio que puso el reparo.

   ⚠️ **Hay una excepción en el código a «Vex nunca escribe primero», y hay que
   decidirla explícitamente.** `Vex-Agente/src/lib/seguimiento.ts` manda un toque
   de seguimiento a leads fríos: si tras responder Vex hay silencio durante
   `SEGUIMIENTO_HORAS` (20 por defecto), escribe *«quedé pensando en lo que me
   contabas…»*. Está bien diseñado —un solo toque por conversación, nunca
   repetido, con salida explícita— y su propio comentario reconoce que *«un
   seguimiento SÍ es Vex escribiendo primero»*.

   No viola la regla del 27-ago en su espíritu: solo ocurre dentro de una
   conversación que el lead ya abrió. Pero **no es una respuesta**, así que la
   decisión es suya: dejarlo, alargar la ventana, o apagarlo. Si se deja, el
   ajuste debería quedar expuesto en el panel Tryvex Intelligence junto al resto
   —hoy es variable de entorno, no ajuste en caliente.

6. **El estado del chip `+56950358818`.** ¿Sobrevivió a los baneos de agosto o es
   uno de los dos quemados? Si sobrevivió, es el activo más delicado del PRP y la
   Fase 0 pasa de recomendable a obligatoria. Si está baneado, hay que apelar
   desde la app (Ajustes → Ayuda → Contáctanos) antes de cualquier otra cosa.

7. ✅ **RESUELTA (27-ago) — el VPS de Tryvex existe, pero la migración NO se
   ejecutó.** Inventariado en vivo, confirmado por el señor Ignacio como el
   servidor de la empresa:

   | | |
   |---|---|
   | Host | `srv1877698` · Ubuntu 24.04.4 · 3 semanas de uptime |
   | Recursos | 7.8 GB RAM (6.5 libres) · 96 GB disco (90 libres) |
   | Ya instalado | Node **v22.23.2** ✓ · Docker 29.6.1 · sin EasyPanel · sin nginx |
   | Puertos | 3000, 3001 y 4600 **libres** · 80 y 443 ocupados |
   | Servicios | `claude-ignacio` (Jarvis 24/7), `docker`, `containerd`, `monarx-agent` |

   **Lo que NO está ahí: el scraper ni `tryvex-wa-bridge`.** Siguen en el
   servidor personal de Cristian (`179.197.224.95`). La mudanza que Ariel
   anunció el 3-ago quedó en diseño.

   Tres consecuencias para el plan:
   - **Desplegar Vex acá no puede romperle nada a Cristian**, porque su
     infraestructura no vive en esta máquina. Cae el requisito de coordinar la
     ventana de corte *para instalar* — sigue vigente para *retirar* el puente.
   - La máquina **sobra** para Vex: pide ~500 MB y hay 6.5 GB libres, con la
     versión de Node exacta que necesita ya instalada.
   - **Falta resolver el HTTPS.** 80 y 443 están tomados sin nginx a la vista, así
     que hay un reverse proxy que identificar. Si es Caddy o Traefik, se reutiliza;
     si pertenece a `claude-ignacio`, hay que buscar otra vía sin tocarlo — ese
     servicio no se interrumpe.

8. **¿Se mueve también el puente a este VPS, o se retira?** Si Vex queda como
   transporte único (Fase 0), la migración pendiente de Ariel deja de tener
   sentido para el puente y pasa a ser solo la del scraper. Conviene decírselo
   antes de que la ejecute.

---

## Crítica adversarial (DeepSeek V4 Pro · 27-ago · T-001)

Revisión externa desde contexto fresco. Cada punto fue **verificado contra el
código** antes de aceptarse — lo que no resistió la verificación queda marcado.

### ⚠️ Aceptado en su principio, DESACTIVADO por la decisión del 27-ago

> *«Un proxy no compensa comportamiento.»*

El principio es correcto y queda escrito. Pero el supuesto sobre el que DeepSeek
lo aplicó —que el plan reintroduce *«el envío automático, el agente responde
solo»*— dejó de ser cierto ese mismo día: el señor Ignacio definió que **el
primer contacto lo envía siempre una persona y Vex solo responde a quien ya
escribió** (ver pregunta 5, resuelta).

Con eso no hay mensajería automatizada saliente que detectar. El agente es
**puramente reactivo**, que es el patrón de menor riesgo de la vía no oficial.
La objeción no se descarta por conveniencia: se descarta porque el escenario que
describía ya no está en el plan. Lo que sí sobrevive de ella es el requisito de
poblar los guardrails de precios antes del primer arranque.

### ✅ Aceptado · La rotación de IP es señal de secuestro de cuenta

Un dispositivo vinculado que cambia de IP constantemente es exactamente el patrón
que WhatsApp asocia a robo de sesión. **Un proxy residencial rotativo puede ser
peor que no tener proxy.** Corrige el requisito de la Fase 0: no sirve cualquier
proxy residencial — tiene que ser de **IP estática o sesión pegajosa**, y hay que
verificar que la IP no venga ya quemada por scrapers.

### ✅ Aceptado · El toggle IA/Humano no tiene estado por defecto definido

Si una conversación nueva arranca en `IA`, el primer contacto sale antes de que
nadie lo revise. **Decidir el default explícitamente en la Meta 4**, y que el
default sea `HUMAN` salvo decisión contraria del señor Ignacio.

### ✅ Aceptado · Retirar transportes a mitad de conversación pierde mensajes

La Fase 0 dice «elegir uno y retirar los otros» sin plan de corte. Con
conversaciones abiertas, eso duplica o pierde mensajes. Aplicar el mismo orden que
Ariel fijó para la migración del VPS: **levantar el nuevo → verificar sano → recién
después apagar el viejo**, y hacer el corte con las conversaciones quietas.

### 🔴 Aceptado y AGRAVADO · El QR de Vex puede quedar expuesto — fail-open

DeepSeek dijo que `/api/connection/status` «devuelve el QR sin auth». **Verificado:
es más grave que eso, y por una razón distinta.** `src/proxy.ts:22` hace:

```ts
if (!authConfigured()) return NextResponse.next();
```

y `authConfigured()` exige las **tres** variables `DASHBOARD_USER`,
`DASHBOARD_PASSWORD` y `DASHBOARD_SESSION_SECRET`. Si falta una sola en el VPS,
el proxy **deja pasar todo el sitio sin autenticar**, QR incluido. No es que falte
auth: es que la auth se apaga sola y en silencio cuando la config está incompleta.
Un fail-open, el mismo patrón del `Cache-Control: public` que ya filtró la agenda.

Requisitos que esto agrega a la Fase 2, todos verificables:
- El QR **nunca** se sirve sin credencial, aunque la config esté incompleta:
  fail-closed, como ya hace `wa-bridge` al negarse a arrancar sin sus tokens.
- **Expiración corta y un solo uso.** Un QR de WhatsApp caduca en ~20s; el
  endpoint no debe servir el mismo más allá de eso.
- **Rate-limit**, o un atacante lo sondea hasta capturar uno válido.
- Verificar el efecto con dos peticiones desde fuera de la sesión, no leyendo el
  código — el mismo criterio que cerró la fuga de la agenda.

### ⚠️ Registrado, decisión ya tomada · Consolidar todo en Cloud API

Es la alternativa técnicamente más limpia —elimina proxy, proceso 24/7, riesgo de
IP y QR de un plumazo— y merece quedar escrita. **Pero choca con la Meta 1**: la
Cloud API no tiene QR, y el señor Ignacio pidió explícitamente escanear desde el
CRM con `+56950358818`. Además exige migrar ese número a WABA, lo que obliga a
sacarlo de la app de consumo. Queda como el camino del **número A de prospección**
(ver la propuesta de dos números), no como reemplazo de las cuatro metas.

### ❌ Rechazado · «Vincular en modo compañero y usar la IP del propio chip»

No se sostiene. Baileys corre en el servidor: el socket sale por la IP del
servidor, no por la del teléfono. El modo compañero no cambia de dónde sale el
tráfico del proceso.

---

## Aprendizajes (Auto-Blindaje)

> Esta sección CRECE con cada error encontrado durante la implementación.

### 2026-08-27: El PRP arranca de una auditoría, no de una página en blanco
- **Error evitado**: el pedido de las cuatro metas se lee como cuatro features
  nuevas, pero tres ya tienen código en `main` — construirlas de nuevo habría
  duplicado el QR, el chat del lead y la identidad de agentes.
- **Fix**: la Fase 1 es verificación de brechas antes de cualquier línea de código.
- **Aplicar en**: todo PRP sobre un área madura de este repo.

---

## Gotchas

- [ ] `Cache-Control: public` en una ruta autenticada = el CDN sirve datos sin
      credencial. Verificar siempre con dos peticiones a una URL nueva.
- [ ] Una FK nueva hacia una tabla ya referenciada sin nombre explícito rompe
      los embeds de PostgREST con 500 (tumbó el calendario en producción).
- [ ] Groq retira modelos sin avisar: la caída del 18-ago fue eso. Preferir
      `VEX_MODEL` / `VEX_MODEL_FALLBACK` por entorno antes que un deploy.
- [ ] `whatsapp-web.js` no es oficial: WhatsApp banea números por volumen hacia
      gente que no te tiene agendado. El tope de la Fase 3 no es opcional.
- [ ] El QR caduca cada ~20s: ninguna vista que lo sirva puede cachearse.
- [ ] El VPS es casa temporal y compartida: usuario propio, systemd propio,
      `MemoryMax` propio. Nada de secretos de otros agentes ahí.
- [ ] El rate limit de `/api/agentes/*` es en memoria del proceso: no coordina
      entre regiones ni sobrevive un restart.
- [ ] "Funciona aquí pero no allá" suele ser que el PR no está desplegado ahí.
      Verificar dónde se está probando antes de declarar un bug.

## Anti-Patrones

- NO reconstruir lo que la Fase 1 encuentre funcionando
- NO dejar que Vex envíe mensajes: envía una persona, siempre
- NO reabrir el camino `wa.me` que el PR #80 sacó del panel
- NO usar controles HTML nativos (fecha, hora, select) en el panel nuevo
- NO proponer una dirección estética nueva: replicar el lenguaje del CRM
- NO queries a Supabase fuera de `lib/repos/`
- NO tipos inline: todo en `lib/types/`
- NO push directo a `main` — un PR por cambio

---

*PRP pendiente aprobación. No se ha modificado código.*
