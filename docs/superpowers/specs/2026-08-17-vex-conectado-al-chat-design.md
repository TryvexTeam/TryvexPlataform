# Vex conectado al chat: mensajes por lead y estado real de la cartera

**Fecha:** 2026-08-17 · **Pedido por:** Cristian · **Estado:** diseño aprobado, sin implementar

---

## El problema, en una frase

Vex sabe redactar y el CRM sabe conversar, pero **no se hablan**: Vex genera un
mensaje excelente y termina abriendo `wa.me` — justo lo que se sacó del CRM el
16-ago al construir el chat interno (PR #80).

Textual del pedido de Cristian:

> *"en el chat de vex yo puedo pedirle un mensaje personalizado para cualquiera
> de los que salen en leads y lo cargue directamente en el chat que creamos
> recién, basándose en el negocio, en Datos, no información falsa, para llegar a
> su dolor o generarle uno, y así también ofrecerle algo o agendar llamada
> dentro de tryvex.tech. Que le pueda preguntar quiénes respondieron. La idea es
> que él sepa todo pero que no haga nada que sea baneable o que sea un cagaso."*

---

## Lo que YA existe (y no se toca)

Auditar antes de construir evitó rehacer medio sistema. Hoy, en `main`:

| Pieza | Dónde | Qué hace |
|---|---|---|
| Motor LLM | `lib/vex/llm.ts` | **Groq**, `llama-3.3-70b-versatile`. No OpenRouter (se creía que sí). Con reintentos ante 429/503. |
| Redacción por lead | `lib/vex/draft.ts` | Prompt de copywriting con framework **PAS**, usando nicho, localidad, `tiene_web`, `info_texto`. Ya incluye `tryvex.tech` y ya prohíbe inventar datos. Acepta instrucciones extra del usuario. |
| Intenciones | `lib/vex/intenciones.ts` | Clasifica en `reporte`, `recomendar`, `marcar`, `preparar_envio`, `conversar`. |
| Datos de cartera | `lib/vex/cartera.ts` | Conteo por estado, listar por estado/nicho/localidad, buscar por nombre, marcar estado. |
| UI | `components/vex/` | Chat de Vex + tarjeta de borrador editable. |
| El chat del lead | `components/leads/lead-chat-wa.tsx` | Hilo dentro del CRM, sale por el buzón → puente. |

**La conclusión que ordena el trabajo: esto es conectar y ampliar, no construir.**

---

## Decisiones tomadas (Cristian, 17-ago)

### 1. Vex nunca envía. Siempre aprieta una persona.

Vex redacta y deja cargado; enviar es de un humano, desde el chat del lead.

**Por qué:** es la respuesta directa a *"que no haga nada baneable o que sea un
cagaso"*. Un agente que redacta mal y no puede enviar produce un borrador feo;
uno que puede enviar produce un cliente perdido.

**Consecuencia agradable:** esto **saca** código. El camino de envío automático
de `TarjetaBorrador` desaparece.

### 2. Solo el primer contacto. Vex no redacta respuestas.

Vex avisa *quién respondió*; la conversación la lleva una persona.

**Por qué:** una vez que el cliente pregunta *"¿cuánto sale?"*, contestar implica
precios y plazos que alguien tiene que cumplir. Eso no se delega en un modelo
sin una política de precios escrita, que hoy no existe.

### 3. Los mensajes salen por el puente, no por la API oficial de Meta.

Hay dos caminos de WhatsApp en el sistema: el de Vex (API oficial de Meta,
`lib/vex/whatsapp.ts`, **nunca configurada** — por eso el fallback a `wa.me`) y
el del chat (puente `whatsapp-web.js`, andando con el número de Tryvex).
**Se unifica en el puente.**

⚠️ **Riesgo asumido, con los ojos abiertos:** `whatsapp-web.js` **no es oficial**.
WhatsApp banea números por automatizar así, sobre todo con volumen hacia gente
que no te tiene agendado — que es exactamente el outreach a leads del scraper.
La API oficial no tiene ese riesgo, pero exige alta en Meta Business y una
**plantilla aprobada** para el primer contacto, lo que choca de frente con el
pedido de mensajes personalizados.

**Se elige el puente porque es lo que funciona hoy**, y se mitiga con topes de
volumen (abajo). La migración a la API oficial queda posible sin rehacer Vex:
todo pasa por el buzón, y cambiar el buzón de salida es cambiar quién lo vacía.

---

## Diseño

### Pieza A — Vex deja el mensaje cargado en el chat del lead

**Acción nueva: `redactar_para`.** Hoy `preparar_envio` trabaja en lote por nicho
o localidad; falta pedir para **un** negocio por su nombre.

> *"Vex, arma un mensaje para Barbería Don Luis"*

Flujo:

1. `clasificarIntencion` devuelve `{ tipo: 'redactar_para', nombres: ['Barbería Don Luis'], instrucciones? }`
2. Se resuelve con `buscarLeadsPorNombre` (ya existe, lo usa `marcar`)
3. Se redacta con `generarDraftLead` (ya existe, sin cambios de fondo)
4. **El borrador se guarda** en `outreach_messages` con `estado='borrador'`
5. Al abrir el chat de ese lead, **el texto ya está en la caja**

El estado `borrador` **ya existe** en el constraint de la tabla (migración 041) y
hoy no lo usa nadie salvo el fallback. No hace falta migración.

**Ambigüedad de nombres:** si el nombre matchea más de un lead, Vex **no elige**:
responde con la lista y pide que se precise. Elegir por él es el tipo de error
que termina con un mensaje en el negocio equivocado.

**Cómo lo lee el chat:** `GET /api/leads/[id]/mensajes` se acompaña de un
`GET /api/leads/[id]/borrador` que devuelve el borrador vigente (el más reciente
con `estado='borrador'`, si existe). `LeadChatWa` lo consulta al montar, junto
con el hilo, y decide qué poner en la caja con esta prioridad:

1. Hay borrador de Vex → se carga, con un rótulo **"borrador de Vex"** visible
2. No hay borrador y el hilo está vacío → la sugerencia de siempre
3. No hay borrador y la conversación empezó → caja vacía

El rótulo importa: quien envía tiene que saber que ese texto lo escribió un
modelo, no un compañero.

**Al enviarse**, el borrador se marca consumido (`estado='encolado'`, que es la
transición que ya hace `/api/wa/send`), así no reaparece en la próxima apertura.

### Pieza B — Vex sabe lo que pasó de verdad

Tres preguntas que hoy no puede responder, todas de solo lectura:

| Pregunta | Acción | Fuente |
|---|---|---|
| *"¿quiénes respondieron?"* | `quien_respondio` | `mensajes_wa` (`direccion='in'`) cruzado con `fact_leads.wa_leido_hasta` |
| *"¿a quién le mandamos?"* | `historial_envios` | `outreach_messages` + `mensajes_wa` (`direccion='out'`) |
| *"¿qué cerramos y cuándo?"* | `reporte` (ampliado) | `fact_leads` con fechas |

**Por qué importa la distinción:** hoy `contactado` es un estado que alguien puso
a mano. Estas tres preguntas responden con **lo que efectivamente ocurrió**, que
puede no coincidir — y cuando no coincide, eso mismo es información.

`wa_leido_hasta` viene de la migración 046 (16-ago), ya aplicada.

Todo esto vive en `lib/vex/actividad.ts`, separado de `cartera.ts`: cartera
responde *"cómo está la ficha"*, actividad responde *"qué pasó"*. Son preguntas
distintas y mezclarlas engorda un archivo que ya tiene cuatro responsabilidades.

### Pieza C — Los frenos, explícitos

1. **`TarjetaBorrador` deja de enviar.** Su botón pasa a **"Abrir en el chat"**,
   que navega al lead con el borrador cargado. Se elimina el uso de
   `/api/vex/whatsapp/send` desde la tarjeta y con él el último `wa.me` del CRM.
2. **Tope de borradores por tanda.** `preparar_envio` ya limita a 50 por
   `recomendarLeads`; se baja a **10 por pedido**. Un lote de 50 mensajes que
   nadie alcanza a leer es exactamente el escenario donde alguien aprueba a ciegas.
3. **Vex es de solo lectura sobre datos de negocio**, salvo dos escrituras
   explícitas y acotadas: guardar un borrador, y `marcar` estado (que ya existía).
   No borra, no envía, no cambia precios, no toca clientes.

**Lo que NO se hace** (fuera de alcance, dicho para que nadie lo asuma): Vex no
responde conversaciones, no envía solo, no toca el scraper, y no se migra a la
API oficial de Meta en esta rama.

---

## Sobre "que no sea el mismo mensaje siempre"

El prompt actual ya usa datos reales y prohíbe inventar. El problema no es el
contenido: es que **los diez mensajes salen con la misma estructura de cuatro
partes**, y leídos en fila se nota el molde.

Se agrega un **ángulo de entrada** que rota entre variantes (la búsqueda en
Google, la comparación con un competidor cercano, la reseña que no está, el
horario que nadie encuentra). Mismo fundamento honesto, distinta puerta.

El ángulo se elige **por lead de forma estable** (derivado del `lead.id`, no al
azar): así, pedir el mensaje dos veces para el mismo negocio no devuelve dos
enfoques distintos, que confundiría a quien está por enviar.

⚠️ **Un ángulo solo se usa si el dato existe.** Si no sabemos si tiene reseñas,
no se abre hablando de reseñas. Ese es el punto de *"no información falsa"*.

---

## Errores y bordes

| Situación | Qué pasa |
|---|---|
| Groq caído o con rate limit | `conReintento` ya reintenta 3 veces; si igual falla, Vex lo dice sin dejar un borrador vacío |
| El LLM devuelve JSON roto | Ya contemplado: el lead sale con `aviso`, no se guarda borrador |
| Nombre ambiguo | Vex lista los candidatos y pide precisión. No elige |
| Lead sin teléfono | No se guarda borrador de WhatsApp; se dice por qué |
| Dos borradores para el mismo lead | Gana el más reciente; los anteriores quedan como historial |
| Alguien edita el texto antes de enviar | Se envía lo editado. El borrador es un punto de partida |

---

## Pruebas

Con la infraestructura actual (vitest sobre `lib/`, `scripts/`, `wa-bridge/`; sin
entorno DOM):

- `lib/vex/actividad.test.ts` — quién respondió, historial, cierres. Casos de
  borde: sin mensajes, respondido y ya leído, lead borrado con mensajes vivos
- `lib/vex/intenciones.test.ts` — que `redactar_para` se clasifique bien y no se
  confunda con `preparar_envio` (uno es por nombre, el otro por lote)
- `lib/vex/draft.test.ts` — que el ángulo sea estable para el mismo lead, y que
  no se use un ángulo cuyo dato falta
- Los componentes (la carga del borrador en la caja) **no tienen test
  automatizado**: el repo no tiene entorno DOM. Se verifica a mano en la preview,
  y se deja dicho — no se declara verde lo que no se probó.

---

## Orden de implementación

1. `lib/vex/actividad.ts` + tests — es solo lectura, no rompe nada
2. `redactar_para` en intenciones + resolución por nombre
3. Guardar el borrador y `GET /api/leads/[id]/borrador`
4. `LeadChatWa` carga el borrador con su rótulo
5. `TarjetaBorrador`: botón "Abrir en el chat", fuera el envío
6. Ángulos de entrada en `draft.ts`

Cada paso deja el sistema funcionando. Si se corta a la mitad, lo que hay sirve.
