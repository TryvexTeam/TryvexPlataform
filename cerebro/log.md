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
