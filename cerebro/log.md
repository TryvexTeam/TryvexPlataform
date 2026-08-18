# log — Bitácora Append-Only (Tryvex App)

> Registro cronológico de eventos, degradaciones, decisiones relevantes.
> NUNCA editar entradas pasadas. Solo agregar al final.

---

## 2026-05-27

- **[SETUP]** Infraestructura Jarvis instalada: CLAUDE.md, AGENTS.md, .claude/ (settings, PRPs, skills, commands), cerebro/
- **[SKILLS]** Skills locales creados: supabase-tryvex, nextjs-tryvex, dnd-tryvex, ai-features-tryvex, find-skill
- **[COMMANDS]** Slash commands instalados: /prp, /bucle-agentico

### 2026-08-03: El SQL Editor de Supabase corre TODO en una transacción
- **Error**: la 023 decía "Success" y los sondeos seguían dando `Realtime NO`. Tres intentos.
- **Causa**: `notificaciones` ya estaba publicada → `42710` → la transacción revirtió las otras once. Antes, `EXECUTE format(... %I ...)` y bloques `DO` encadenados devolvían `42601` porque el editor los mutila.
- **Fix**: sentencias planas, sin SQL dinámico, y pedir el estado real antes de suponer: `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`.
- **Aplicar en**: toda migración que se pegue en el SQL Editor. Un error en la línea 40 borra lo de la línea 1.

### 2026-08-03: Código nuevo + base vieja = ventana que rompe lo que funcionaba
- **Error**: `listMensajes` pidió `mensaje_adjuntos(...)` y el chat entero dejó de cargar con `PGRST200`.
- **Causa**: Vercel despliega solo al mergear a `main`, pero las migraciones se corren a mano. Entre una cosa y otra hay una ventana real.
- **Fix**: reintentar sin la relación cuando el error es `PGRST200`. Una función que falta no puede tumbar una que ya andaba.
- **Aplicar en**: cualquier consulta que dependa de una migración todavía no aplicada.

### 2026-08-03: `break-words` no alcanza sin tope de ancho
- **Error**: una clave SSH pegada en el chat estiraba la burbuja a 580px dentro de una caja de 252 y aparecía scroll horizontal en móvil.
- **Causa**: dentro de un `flex-col` con `items-start`, el hijo se dimensiona a `max-content`. `overflow-wrap` no actúa si nada limita el ancho.
- **Fix**: `max-w-full` en la burbuja + `min-w-0` en los flex padres.
- **Aplicar en**: toda caja que muestre texto de origen ajeno.

## 2026-08-17 — Protocolo "LOS AVENGERS" registrado

Primera corrida real de orquestación multi-CLI recursiva (AGY+Opus 4.6 / OpenCode+Opus 5)
sobre el dashboard operativo. Nombre puesto por el señor Ignacio. Nodo:
`cerebro/protocolo-avengers.md`. T-001 aceptada (28 tablas, 38 KPIs, 11 gaps);
T-002 falló la escritura y se reparó con `run -c`. Auto-blindaje: 4 errores
documentados (pull previo, Test-Path rancio, .next sucio, Write aborted).

## 2026-08-18 — Sesión Avengers cerrada para reinicio

T-001 aceptada, T-002 sin entregable (saldo OpenCode Zen agotado, ~$5 sin producto).
Nodo de sesión: `sessions/2026-08-17-avengers-dashboard.md`. Skill `/avengers` creada.
Directiva permanente de criterio de consumo guardada en memoria. Repo en a4921f0,
tsc exit 0. Pendiente: cerrar T-002 y sintetizar el PRP del dashboard.

## 2026-08-18 — PRP-008 fases 1-3 + tres errores propios

### ERROR CARO: agregar una FK rompió una consulta que ya funcionaba

- **Qué pasó**: tras aplicar la migración 051, `GET /api/eventos` empezó a devolver
  500 y el calendario de equipo dejó de cargar en producción. Lo detectó el señor
  Ignacio, no yo.
- **Causa raíz**: la 051 agregó `eventos_asistentes.asignado_por` con FK a
  `dim_integrantes`. Esa tabla quedó con **DOS** foreign keys hacia la misma tabla.
  El embed `dim_integrantes ( nombre )` de `EventosRepository.listRango` se volvió
  ambiguo y PostgREST no pudo resolver la relación.
- **Fix**: nombrar la FK en el embed →
  `dim_integrantes!eventos_asistentes_integrante_id_fkey ( nombre )`.
- **Por qué no lo vi**: verifiqué que la migración aplicara, que las policies
  funcionaran y que el backfill fuera correcto. **No verifiqué el efecto sobre las
  consultas que ya existían.** Una migración aditiva parece inofensiva y no lo es.
- **REGLA PERMANENTE**: antes de aplicar una migración que agregue una FK, hacer
  `grep` de los embeds PostgREST hacia la tabla apuntada. Si la tabla origen queda
  con más de una FK al mismo destino, TODOS sus embeds deben nombrar la FK.
  Query de auditoría:
  ```sql
  select conrelid::regclass, count(*) from pg_constraint
   where contype='f' and confrelid='<tabla>'::regclass
   group by conrelid having count(*) > 1;
  ```
- **Bonus**: la misma trampa estaba en mi código nuevo (`lead_asignaciones` también
  quedó con dos FKs). Se corrigió antes de llegar a producción solo porque el fallo
  del calendario me obligó a auditar el esquema completo.

### ERROR: dar por bueno el trabajo de un worker sin verificar que el código se use

- **Qué pasó**: el worker puso el stack de avatares en `lead-card.tsx` y
  `leads-pipeline.tsx`. Ambos son **código muerto**: nadie los importa. Los avatares
  no habrían aparecido nunca.
- **Causa**: el spec nombraba archivos "de leads" sin verificar cuál se renderiza.
  El worker cumplió el contrato al pie de la letra; el contrato estaba mal.
- **REGLA PERMANENTE**: antes de despachar UI, verificar quién importa el componente
  (`grep -rn 'NombreComponente' --include=*.tsx | grep -v el-propio-archivo`). Un
  componente sin importadores es código muerto. Va en el spec, no se descubre después.

### ERROR: ofrecer una opción sin conocer su letra chica

- **Qué pasó**: ofrecí "branch de Supabase" para probar la migración sin riesgo. La
  branch **no copia los datos de producción**, así que no habría verificado nada de
  lo que prometí. Además tiene costo por hora.
- **REGLA PERMANENTE**: no ofrecer una vía como segura sin conocer sus límites. Si
  se descubre después, corregir de inmediato y decirlo, no dejarlo pasar.

### Lo que SÍ funcionó y conviene repetir

- **Probar RLS en una transacción con `RAISE EXCEPTION` al final**: aplica el DDL,
  siembra datos, simula usuarios reales con `set_config('request.jwt.claims', ...)`,
  acumula resultados en texto y aborta. Devuelve el veredicto en el mensaje de error
  y revierte todo. Cero residuo, verificación real contra producción.
- **Preguntar antes de construir sobre una regla de negocio supuesta**: T-002 diseñó
  asignación manual; el señor Ignacio quería automática por contacto. La evidencia le
  dio la razón: 541 leads, 0 asignados con el modelo manual que ya existía.
