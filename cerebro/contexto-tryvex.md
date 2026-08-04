# Contexto de Tryvex

> Lo que hay que saber antes de tocar nada. La bitácora del cerebro cuenta **qué pasó**;
> este documento cuenta **sobre qué pasó**.
>
> Se sube al cerebro con `node --env-file=.env.local scripts/ingesta-cerebro.mjs contexto`.
> Cada `##` de acá es una entrada de la bitácora, fuente `contexto`.
>
> Este repo es **público**: acá no van teléfonos, llaves, cadenas de conexión ni datos de clientes.

## Qué es Tryvex

Agencia de tecnología fundada en Santiago de Chile por Ignacio Navarrete junto a tres socios.
Vende **landing pages** y **automatizaciones a medida**, con IA como motor operativo para
mantener el costo bajo y el margen sano.

El equipo es joven y part-time: la ventaja competitiva no es el tamaño, es que **una parte del
trabajo la hacen agentes** que trabajan de noche, documentan lo que hacen y no se olvidan.

La regla de fondo del negocio: la recurrencia (hosting, mantención, soporte) vale más que el
proyecto puntual, porque es lo que sostiene el flujo mes a mes.

## Cómo se consigue un cliente

El sistema de adquisición no espera que el cliente llegue: **lo sale a buscar**.

1. Un **scraper** recorre Google Maps y directorios del Gran Santiago.
2. Filtra los negocios **sin presencia web activa** — los que necesitan justo lo que vendemos.
3. Guarda nombre, teléfono, redes y nicho en `fact_leads`.
4. **Vex** (el agente comercial) redacta el primer mensaje con el contexto de ese negocio.
5. El contacto sale por **WhatsApp**, y la respuesta vuelve al CRM sin salir de la ficha del lead.

Nichos donde el mismo pitch sirve para muchos: **barberías y peluquerías** son el bloque más
grande, seguidos de gimnasios, talleres y ópticas.

> **El cuello de botella nunca fueron los leads.** Hay cientos sin contactar. El dinero está en
> **activar el contacto**, no en juntar más nombres.

## El CRM: qué es cada cosa

`TryvexPlataform` es el CRM propio (Next.js 16 + Supabase). El modelo de datos es un
data-warehouse en estrella:

| Tabla | Qué guarda |
|---|---|
| `fact_leads` | negocios candidatos que trajo el scraper |
| `dim_clientes` | los que ya compraron |
| `dim_proyectos` | trabajos activos e históricos |
| `fact_ventas` | ventas cerradas |
| `tareas` | el pipeline de trabajo del equipo, humanos y agentes |
| `mensajes_wa` | el hilo real de WhatsApp con cada lead |
| `cerebro_entradas` | la bitácora: qué pasó y por qué |

El estado de un lead avanza `sin_contactar → contactado → interesado → reunion_agendada →
ganado | perdido`. Ojo con la distinción: **`descartado`** es el que nunca calificó;
**`perdido`** es el que avanzó y se cayó. No son lo mismo y mezclarlos arruina la medición.

## El equipo: humanos y agentes

Tryvex trabaja con **tres agentes de IA**, cada uno con su humano:

| Agente | Con quién trabaja | De qué se ocupa |
|---|---|---|
| **Jarvis** | Ignacio | la plataforma, la vista, la coordinación |
| **Ariel** | Cristian | Vex, el scraper, la infraestructura del contacto |
| **Spike** | Adley | el bridge de WhatsApp, la capa de datos, revisión cruzada |

Los tres se coordinan en el canal **#chatia** de Discord y firman su trabajo en la tabla `tareas`.

**Vex** es distinto: no es un integrante, es el **agente comercial** del CRM — el que redacta la
copy de contacto y responde consultas sobre la cartera.

> Hay un problema conocido y todavía abierto: los agentes firman con las cuentas de sus humanos.
> Lo que hace Ariel aparece como Cristian. Si mañana hay que saber quién hizo qué, hoy no se puede.

## Cómo trabajamos (las reglas que costaron caro)

Ninguna de estas es teoría: cada una salió de un error real.

- **El canal es transporte, no memoria.** Si no está en git o en la base, no existe.
- **El que ejecuta no valida.** Doble firma cruzada, siempre.
- **Verificado significa que lo confirma el sistema**, no que el agente lo diga: exit code,
  respuesta HTTP, fila en la base, captura. No "quedó listo".
- **Lo reversible corre suelto; lo irreversible pide permiso.** Deploy a producción, mensajes a
  leads reales, gastar plata o borrar datos no se firman solos.
- **Seguridad antes que foco.** Una vulnerabilidad no se cierra pagando: se cierra, o se le avisa
  al cliente que sus datos están expuestos y decide él.
- **Auto-Blindaje:** cada error se documenta en su PRP. El mismo error no ocurre dos veces.
- **Mapear antes de planificar.** No se planifica lo que no se entiende — más de un bug grave
  apareció mapeando, no codeando.

## Gobernanza: qué cuenta usa cada cosa

Esto no es burocracia, es lo que evita que el negocio dependa de una persona.

- Los **PR se mergean desde la cuenta de Tryvex**, nunca desde cuentas personales.
- **Vercel** despliega bajo el equipo de Tryvex — hay más de un proyecto con nombre parecido, y
  apuntar al equivocado hace que "el merge se vea perfecto" mientras producción no cambia.
- **Un merge a `main` no despliega solo**: el deploy de producción es manual y hay que correrlo.
- La **infraestructura 24/7** (scraper y bridge de WhatsApp) vive en un **VPS de la empresa**,
  ya no en el servidor personal de nadie.

> **Verificar el efecto, no la configuración.** Que el PR esté mergeado no prueba que el sitio
> cambió: eso se comprueba en la URL pública.

## El estado del negocio, en una línea

Está **casi todo construido y todavía poco encendido**. La cadena completa —scraper → Vex →
WhatsApp → CRM → bitácora— existe y se probó punta a punta. Lo que falta rara vez es código:
es que alguien apriete el botón, cargue una llave o apruebe un envío.

Por eso el cerebro registra también **lo que está esperando a un humano**: si no queda escrito,
se pierde en el canal y vuelve a preguntarse la semana siguiente.

## El chat del equipo

El CRM tiene chat propio: mensajes directos, grupos y un canal de agentes. No es un
extra — es donde va a vivir la coordinación que hoy está en Discord.

Lo que se puede hacer: **responder** a un mensaje puntual, **abrir un hilo** colgado
de uno (un solo nivel, como Slack), **adjuntar** imágenes y archivos —los de texto se
leen sin descargarlos—, y **borrar**. Cada uno borra lo suyo; el admin, cualquiera.

Escribe markdown como Discord: negrita, listas, tablas, código, citas, enlaces
automáticos y spoilers. Un salto de línea simple **es** un salto de línea, a
diferencia del markdown clásico que junta las líneas.

Desde el teléfono: deslizar a la derecha responde, mantener presionado abre el menú.

> **La foto y el estado no son adorno.** El avatar sale del perfil de cada uno, y el
> punto de disponibilidad se deriva del **turno marcado** y del **calendario** — no de
> un interruptor que alguien se olvida de apagar.

## El canal de agentes

Jarvis, Ariel y Spike corren como servicios, sin navegador: no pueden pasar por el
login. Entran al canal con un **token** del que la base solo guarda el hash.

Es el destino de la migración de #chatia. Mientras tanto, el cerebro **ya ingiere** ese
canal: lo que se decide en Discord queda en la bitácora del CRM, con enlace al
mensaje original.
