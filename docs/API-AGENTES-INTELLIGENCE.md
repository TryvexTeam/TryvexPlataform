# API de Intelligence para agentes

Cómo un agente (Jarvis, Ariel, Spike, Goku…) trabaja con Tryvex Intelligence:
lee lo que el equipo le pidió, responde, y reporta lo que hace para que la
pantalla muestre datos reales.

Todas las rutas usan la misma llave que ya usan `/api/agentes/mensajes` y sus
hermanas:

```
Authorization: Bearer txa_…
Content-Type: application/json
```

El cuerpo tiene que ir en **UTF-8**. Si llega en otra codificación (típico en
Windows con Windows-1252) la API lo rechaza con un 400 en vez de guardar las
tildes rotas.

Cada llamada cuenta como **latido**: la Sala deduce si el agente está
trabajando, en reposo o sin señales a partir de la última vez que llamó.

Límite: 60 llamadas por minuto por agente. Pasado eso, `429` con `Retry-After`.

---

## 0. Empezar: el manual y el cliente

**Cualquier IA con un token puede arrancar sola.** La primera llamada es:

```http
GET /api/agentes/manual
```

Devuelve quién es el agente (`agente.id`, `agente.nombre`), las reglas, el
ciclo recomendado y todas las rutas con ejemplos. No hace falta leer este
documento para empezar a trabajar.

Y hay un cliente listo, el mismo con el que los agentes ya hablan en el canal
del equipo: [`scripts/agente-tryvex.py`](../scripts/agente-tryvex.py). Solo usa la
biblioteca estándar de Python.

```bash
python agente-tryvex.py manual                      # quién soy y qué puedo hacer
python agente-tryvex.py encargos                    # mi trabajo aprobado
python agente-tryvex.py tomar <id>
python agente-tryvex.py responder <id> --file respuesta.txt
python agente-tryvex.py directivas                  # lo que decidió el equipo
python agente-tryvex.py nuevos                      # el canal del equipo
```

Los textos largos van por archivo (en Windows, por argumento se pierden las
tildes). Los errores se muestran con el motivo del CRM y salen con código 1;
una rutina apagada por el equipo sale con código 3.

---

## 1. La cola de encargos — la regla del permiso

Un encargo nace **`encolado`**: el agente puede verlo, pero **no puede
trabajarlo** hasta que una persona del equipo lo apruebe en la pantalla Cola.
No es una convención: la API rechaza cualquier intento con `409`, y la base
impide aprobar sin dejar constancia de quién aprobó.

```
encolado ──(una persona aprueba)──► aprobado ──tomar──► en_curso ──responder──► respondido
    └──(una persona rechaza)──► rechazado
```

### Leer mi trabajo

```http
GET /api/agentes/encargos
```

Devuelve lo `aprobado` y lo `en_curso`, lo urgente primero.

```json
{ "success": true, "agente": "Jarvis",
  "encargos": [{ "id": "…", "tipo": "tarea", "titulo": "…", "detalle": "…",
                 "estado": "aprobado", "prioridad": "alta", "aprobado_at": "…" }] }
```

Con `?todos=1` también devuelve lo `encolado`, **solo para leer**: sirve para
saber qué viene, no para ejecutarlo.

### Tomar y responder

```http
PATCH /api/agentes/encargos
{ "accion": "tomar", "id": "<uuid>" }

PATCH /api/agentes/encargos
{ "accion": "responder", "id": "<uuid>", "respuesta": "Lo que hice o lo que averigüé" }
```

- `tomar` solo funciona sobre lo `aprobado`.
- `responder` funciona sobre lo `aprobado` o `en_curso`. La respuesta no puede ir
  vacía: un "listo" sin contenido no se puede revisar.
- Si el encargo no es suyo, no está aprobado o ya se respondió: `409` con la
  explicación. Nunca un 200 mudo.

### Ciclo recomendado

```
cada 1–5 minutos:
  GET /api/agentes/encargos
  para cada encargo:
    PATCH tomar
    … hacer el trabajo …
    POST /api/agentes/consumo   (lo que gastó)
    PATCH responder
```

---

## 1b. Directivas del equipo

```http
GET /api/agentes/directivas?para=conversacion      (por defecto)
GET /api/agentes/directivas?para=primer_mensaje
```

Las decisiones que el equipo publica en Intelligence: "este mes hay 20 % de
descuento en landings", "no ofrecer IA hasta octubre". **Mandan sobre el guion
del agente.** Solo llegan las activas y vigentes hoy (día chileno): una
promoción con fecha de término se apaga sola.

Un descuento se dice como porcentaje, nunca como monto calculado: el filtro de
salida del agente de WhatsApp bloquea las cifras que no están en su guion.

---

## 2. Reportar lo que gasta

```http
POST /api/agentes/consumo
{ "modelo": "claude-sonnet-5", "tokensEntrada": 1200, "tokensSalida": 340,
  "costoUsd": 0.0081, "encargoId": "<uuid opcional>" }
```

En **dólares**, que es como cobran los proveedores. La pantalla Costos lo pasa a
pesos con el dólar observado del día (mindicador.cl).

Mientras un agente no reporte, Costos lo lista como **"sin reporte de
consumo"**: no se muestra en cero, porque no se sabe.

> El bot de WhatsApp **no** usa esta ruta: su gasto ya lo registra el VPS.
> Reportarlo acá lo contaría dos veces.

Un reporte de más de 500 dólares se rechaza: casi siempre es un error de
unidades.

---

## 3. Conocimiento: qué documento usó

```http
GET  /api/agentes/citas            → los documentos del Cerebro, para leerlos
POST /api/agentes/citas            → "usé este documento"
{ "documentoId": "<uuid>", "encargoId": "<uuid opcional>" }
```

Los documentos viven en la sección **Cerebro** del CRM (`cerebro_docs`). Un
documento que ningún agente cita en 30 días aparece marcado en Conocimiento:
o está mal escrito o nadie pregunta por eso.

---

## 4. Rutinas

```http
PUT /api/agentes/rutinas
{ "nombre": "Resumen diario de leads",
  "tipo": "reloj",                          // o "evento"
  "disparador": "todos los días a las 09:00",
  "resultado": "ok",                        // opcional: la corrida que acaba de hacer
  "detalle": "12 leads revisados",          // opcional
  "proximaAt": "2026-09-24T12:00:00Z" }     // opcional
```

Crea la rutina la primera vez y la actualiza después (por nombre). Reporte
**cada corrida**: una rutina de reloj cuya próxima corrida ya pasó hace más de
una hora aparece **ATRASADA** en el Espacio del agente. Es la única forma de
enterarse de un fallo silencioso.

La respuesta trae el estado vigente:

```json
{ "success": true, "activa": true }
```

El equipo puede apagar una rutina desde la pantalla. Si la respuesta trae
`"activa": false`, el agente **no debe correrla** hasta que vuelva a `true`.
Mientras no mande `activa` en el cuerpo, la API respeta lo que decidió el
equipo.

---

## 5. Proponer una mejora

```http
POST /api/agentes/mejoras
{ "titulo": "Agregar el horario de atención al guion",
  "detalle": "Qué cambiar y dónde",
  "evidencia": "4 de 9 dudas de la quincena preguntan por el horario" }
```

La evidencia es obligatoria: una mejora sin el dato que la justifica es una
opinión. Nace `propuesta`; una persona la aprueba, la marca como aplicada o la
descarta con un motivo. El agente no puede aprobarse a sí mismo.

---

## 6. Agendar reuniones

`POST /api/agentes/eventos` (ya existía). Ahora deja marcado qué agente agendó,
y eso alimenta la tarjeta **Reuniones agendadas** de Métricas.

---

## Lo que la pantalla deriva sola (no hay que reportarlo)

| Pantalla | De dónde sale |
|---|---|
| Conversaciones | `mensajes_wa` + `fact_leads` |
| Traspasos | `mensajes_wa`: cliente sin respuesta, o persona que tomó la conversación después del bot |
| Métricas | función `intelligence_metricas` en la base + analítica del VPS |
| Insights | dudas que el VPS clasifica con IA + dudas que el equipo encoló |
| Canales | estado del número en el VPS |

## Lo que todavía no se mide

- **Motivo fino de un traspaso** (reclamo, precio no autorizado, dato
  sensible…): el agente de WhatsApp no lo registra al soltar. Hoy solo se
  distinguen "nadie le respondió" y "lo tomó una persona".
- **Frenos aplicados**: el agente frena respuestas inventadas, pero no deja
  constancia. Métricas lo muestra como "sin medir".
- **Evidencias de un encargo**: no hay tabla todavía; la respuesta es la única
  constancia.
