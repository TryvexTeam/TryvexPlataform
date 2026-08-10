# WhatsApp dentro del CRM — diseño

**Fecha:** 2026-08-10 · **Pedido por:** Cristian · **Estado:** aprobado, sin implementar

## Qué se pide

Que al apretar el botón de WhatsApp en la sección de leads se abra el chat de ese
cliente **dentro del CRM, en la misma ventana**, con el mensaje personalizado ya
escrito, saliendo del número de Tryvex. Y que el equipo pueda **responder y leer
lo que contestan** sin salir de la plataforma.

Textual: *"no queremos que nos mande a la página de WhatsApp Web sino hablarle
desde ahí mismo"*.

Es solo para el equipo interno.

## Lo que ya existe (y por eso esto NO se construye de cero)

Auditado el 10-ago-2026 antes de diseñar nada:

| Pieza | Dónde | Estado |
|---|---|---|
| Panel de chat (globos, autoría, hora, entrantes/salientes) | `components/leads/lead-whatsapp-panel.tsx` | ✅ construido |
| Endpoint del hilo | `app/api/leads/[id]/mensajes/route.ts` | ✅ |
| Endpoint de envío | `app/api/wa/send/route.ts` | ✅ (habla por HTTP con el puente) |
| Salud y QR | `app/api/wa/health`, `app/api/wa/qr` | ✅ |
| Pantalla de vinculación remota | `app/(app)/settings/whatsapp/page.tsx` | ✅ |
| Puente whatsapp-web.js | VPS `179.197.224.95:/opt/wa-bridge` | ✅ corriendo |
| Registro de entrantes y salientes | tabla `mensajes_wa` (`direccion` in/out) | ✅ |
| Cola de salida con throttle (1 msg/min) | `index.js` del puente | ✅ |

**El trabajo real es conectar y destrabar, no construir.**

## Por qué no funciona hoy

Dos bloqueos, verificados en el servidor:

1. **La sesión de WhatsApp nunca se vinculó.** `GET /health` del puente devuelve
   `{"ok":true,"sesionLista":false}` y el log imprime un QR nuevo cada ~20 s.
2. **El puente solo escucha en `127.0.0.1:4600`.** El CRM corre en Vercel, o sea
   en internet: **no lo alcanza**. Por eso "Enviar desde el CRM" siempre mostró
   *"el envío desde el CRM aún no está disponible"* — el mensaje era correcto,
   pero nadie sabía por qué.

## 🔒 El riesgo que define el diseño

El puente guarda **todo mensaje entrante**, y si el número no corresponde a
ningún lead, **crea una ficha nueva** con ese número y el texto
(`crearLeadDesdeNumeroDesconocido`).

Eso está bien pensado para un número comercial — no perder el mensaje de un
cliente potencial — pero **es inaceptable con un número personal**: los mensajes
de la familia y los amigos de Cristian terminarían en la base de la empresa,
legibles por todo el equipo, sin que esas personas lo hayan consentido.

**Decisión (Cristian, 10-ago): se pilotea con su número, pero con lista blanca.**
Es la única forma de probar hoy sin filtrar conversaciones de terceros.

## Diseño

### La inversión que resuelve la conectividad

Hoy el CRM **llama** al puente. En vez de exponer el puente a internet (puerto
abierto, o un túnel de Cloudflare cuya dirección cambia en cada reinicio — ya
mordió dos veces la semana del 8-ago), se da vuelta:

> **El CRM deja el mensaje anotado en la base; el puente lo pasa a buscar.**

Es el mismo patrón de `scraper_runs` (migración 040), ya probado en producción el
mismo día. Consecuencias: sin puerto abierto, sin dirección que se mueva, y si el
servidor está caído el mensaje queda encolado en vez de perderse.

La tabla `outreach_messages` **ya tiene la forma exacta** de un buzón
(`lead_id, canal, texto, estado, aprobado_por, wa_message_id, error, created_at,
enviado_at`). No hace falta migración nueva.

**Los entrantes no necesitan nada:** el puente ya escribe directo en Supabase.

### Fase 1 — la cañería (acá está todo el riesgo)

**1.1 Modo prueba en el puente**
Variable `WA_BRIDGE_SOLO_NUMEROS` (lista separada por comas). Si está puesta:
- entrante de un número que no esté en la lista → **se ignora entero**: no se
  guarda, no se crea ficha, no se registra el texto;
- saliente hacia un número que no esté en la lista → se rechaza, para que una
  prueba no le llegue por accidente a un lead real.

Si la variable está vacía o no existe, el comportamiento es el de hoy (sin
filtro). Así el modo prueba se saca borrando una línea, no revirtiendo código.

**1.2 Vincular el WhatsApp**
Cristian escanea el QR con su teléfono. Se le hace llegar el QR como imagen —
la pantalla de ajustes del CRM no sirve todavía porque también depende de
alcanzar el puente.

**1.3 El buzón**
- `app/api/wa/send/route.ts` deja de hacer `fetch(WA_BRIDGE_URL + '/send')` y pasa
  a **insertar** en `outreach_messages` con `estado='pendiente'`.
- El puente suma un ciclo que cada ~10 s toma los pendientes, los manda por su
  cola con throttle, y marca `estado='enviado'` + `wa_message_id` + `enviado_at`,
  o `estado='fallido'` + `error`.
- Se toma **una fila por vez** y se marca antes de mandar, para que dos ciclos
  solapados no manden el mismo mensaje dos veces.

**Criterio de aceptación de la Fase 1** (sin esto no se sigue):
desde el CRM se manda un mensaje al número de Cristian → le llega al celular →
contesta desde el celular → la respuesta aparece en el hilo del CRM.

### Fase 2 — la experiencia pedida

**2.1 El botón abre el chat en la misma ventana**
`components/leads/lead-panel.tsx` (~línea 423) hace hoy
`window.open('https://wa.me/...')`. Se reemplaza por **desplegar el panel de chat
ahí mismo, debajo del lead** (expansión en la misma vista): sin pestaña nueva,
sin navegar a otra página, sin modal que tape la lista. El botón pasa a abrir y
cerrar ese panel. El `wa.me` **se elimina**: es justamente lo que Cristian no
quiere.

**2.2 Escribir libre**
Hoy `lead-whatsapp-panel.tsx` solo puede mandar el template fijo. Se agrega una
caja de texto: el template llega precargado y editable, y se puede escribir
cualquier cosa.

**2.3 El hilo se actualiza solo**
Sondeo de `/api/leads/[id]/mensajes` cada pocos segundos **mientras el panel está
abierto** (se corta al cerrarlo). Se elige sondeo y no realtime por ser el patrón
que ya usa el resto del sistema y por no sumar una pieza nueva para esto.

## Qué NO entra (a propósito)

- **Envíos masivos.** Decisión previa del equipo, no se reabre.
- **API oficial de WhatsApp Business.** Sería lo correcto para escalar, pero pide
  verificación de Meta y plantillas aprobadas. No para un piloto de un día.
- **Que el cliente vea algo distinto.** Del otro lado es un WhatsApp normal.
- **Chat de clientes (`cliente_id`).** Existe la columna, pero el pedido es leads.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Se filtran conversaciones personales de Cristian | Lista blanca (1.1). Es el motivo de que exista |
| Ban del número por parecer robot | Throttle de 1 msg/min ya construido. En el piloto se le escribe a un solo número |
| `whatsapp-web.js` no es oficial: WhatsApp puede romperlo | Riesgo asumido y conocido. La salida es la API oficial, fuera de alcance |
| Un mensaje se manda dos veces | Se marca la fila antes de enviar, una por vez |
| La sesión se cae y nadie se entera | `/health` ya expone `sesionLista`; hay vigía por webhook. Verificar que avise |

## Estado del servidor al 10-ago-2026

- Puente: `tryvex-wa-bridge.service`, usuario `bridge`, `/opt/wa-bridge`,
  `127.0.0.1:4600`, `Restart=always`.
- Sesión esperada: `session-tryvex-56950358818` (**se cambia al número de Cristian
  para el piloto**).
- `GET /health` → `{"ok":true,"sesionLista":false,"colaPendiente":0}`.
