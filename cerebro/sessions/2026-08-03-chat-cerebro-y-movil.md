---
name: 2026-08-03-chat-cerebro-y-movil
description: "Jornada larga — el cerebro deja de ser ciego a la conversación, el chat pasa a nivel Slack, y el móvil deja de ser inusable. Migraciones 021-027."
metadata:
  type: project
  area: feature
---

# Sesión 2026-08-03 — Cerebro, chat y móvil

## Contexto de entrada

`/cerebro` recién mergeado (PR #31) pero **ciego a la conversación**: se alimentaba
solo de filas de la base, así que contaba QUÉ pasó y nunca POR QUÉ. El chat interno
existía (PR #30) pero abrir uno devolvía 500. El móvil no se había probado nunca.

## Lo construido, en orden

| PR | Qué |
|---|---|
| #32 | Ingesta de #chatia + contexto fundacional + markdown en la bitácora |
| #35 | Fix del 500 al abrir un chat + markdown en los mensajes |
| #36 | Realtime: las tablas no estaban publicadas |
| #38 | Alinear el archivo de la 023 con lo que de verdad se aplicó |
| #40 | Tablas en markdown, foto propia del hilo, canal de agentes con su nombre |
| #41 | Avatares, presencia real, multimedia, canal de agentes, móvil |
| #42 | Fix de `/hoy`, borrado real, gestos táctiles |

**Migraciones 021 → 027.** 021 abre el cerebro a fuentes externas · 022 crea el chat
de forma atómica · 023 publica las tablas en Realtime · 024 buckets, adjuntos,
presencia y agentes · 025 avatar del hilo · 026 respuestas, hilos y borrado ·
027 permisos de borrado.

## Decisiones que conviene recordar

**El cerebro ingiere on-demand, no por cron.** Se corre cuando se trabaja en Tryvex.
El destilado lo escribe quien ingesta; el script deja el borrador y no inventa
resúmenes. `origen_ref` es `chatia:<día>`, no el id del mensaje: así reingestar un
día **corrige** el destilado en vez de duplicarlo.

**Los adjuntos se sirven por endpoint propio**, no con URLs firmadas guardadas en el
mensaje. Esas vencen a mitad de la conversación y quedan en el historial para
siempre. El endpoint revalida la pertenencia en cada pedido.

**La presencia sale de hechos, no de un flag.** `activo` decía si la persona
pertenece al equipo; la vista `presencia_equipo` la deriva del turno abierto en
`jornadas` y de las reuniones del calendario.

**Los agentes se autentican con token cuyo hash es lo único que guarda la base**,
comparado en tiempo constante. Con `===` el tiempo de respuesta filtra cuántos
caracteres coinciden.

**El markdown devuelve nodos de React, no HTML.** El contenido viene de Discord y del
chat: nunca pasa por `dangerouslySetInnerHTML`.

## Pendientes

1. **Las tres llaves VAPID en Vercel + redeploy** — es lo único que impide que
   lleguen las notificaciones al celular. Verificado: la pública no está en el
   bundle de producción.
2. Correr la **027** y mergear el **#42**.
3. El canal "Equipo agéntico" quedó sin foto.
4. Migrar #chatia al CRM (ya avisado al equipo).
5. **El iPhone no se pudo probar** — los insets son la corrección estándar, pero
   eso lo confirma un teléfono real.

## Aprendizajes (Auto-Blindaje)

Ver `cerebro/log.md`. Los cuatro que más costaron:

- El SQL Editor corre **todo en una transacción** y mutila `format()/%I`, bloques
  `DO` encadenados y subconsultas multilínea. Sentencias planas, policies en una
  línea, y **pedir el estado real antes de suponer**.
- **Código nuevo + base vieja es una ventana real**: Vercel despliega al mergear,
  las migraciones se corren a mano. Una consulta que pide una tabla inexistente
  tumbaba el chat entero.
- **Suscribirse a una tabla no publicada no da error.** El canal responde
  `SUBSCRIBED` y no llega nada nunca. La peor clase de falla.
- **supabase-js cachea los canales por nombre** y `removeChannel` es asíncrono. Un
  remonte reusaba un canal ya suscrito y el error tumbaba la página entera.
