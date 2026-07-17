# wa-bridge — variables de entorno

Crear un archivo `.env` en esta carpeta (nunca commitear el real — ya cubierto por el `.gitignore` del repo raíz) con estas claves:

- `WA_BRIDGE_DB_URL` — URL del proyecto Supabase de Tryvex (la misma que usa Next.js).
- `WA_BRIDGE_DB_SECRET` — la Service Role Key de Supabase (Project Settings → API → service_role, secreta). Este proceso no corre en el ciclo de request de Next.js, por eso necesita la key de servicio directamente en vez de la sesión del usuario. Se usa un nombre de variable propio de este servicio (no el mismo que usa la app principal) para poder rotarla sin tocar Next.js.
- `WA_BRIDGE_CHIP_ID` — identificador del número/chip de WhatsApp que usa este bridge (ej. `tryvex-principal`).
- `WA_BRIDGE_PORT` — puerto del servidor HTTP interno que expone `POST /send` (default 4600; Next.js le habla acá desde `app/api/wa/send/route.ts`).
- `WA_BRIDGE_INTERNAL_TOKEN` — token para que solo Next.js pueda llamar a `POST /send`. **Obligatorio: el proceso no arranca sin esto** (fail-closed, agregado tras la revisión de seguridad del 2026-07-17 — antes, si faltaba, el endpoint quedaba sin ninguna autenticación).
- `WA_BRIDGE_QR_TOKEN` — token **distinto** al anterior, para `GET /qr` (el link que se comparte con quien va a escanear remoto). **También obligatorio.** Separado a propósito: si este se filtra (queda en historial de navegador, en logs de un túnel, en el chat donde se comparte para coordinar el escaneo), no debe dar de regalo la capacidad de mandar mensajes — por eso no es el mismo valor que `WA_BRIDGE_INTERNAL_TOKEN`.

  Generar ambos con:
  ```bash
  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
  ```
- `WA_BRIDGE_SEND_INTERVAL_MS` — ritmo de envío en ms entre mensajes salientes. Warm-up: empezar alto y bajar gradualmente. Acuerdo del equipo en #chatia: 1 mensaje/minuto = `60000`.
- `WA_BRIDGE_HEARTBEAT_WEBHOOK_URL` — a dónde reporta el vigía si la sesión de WhatsApp se cae. Endpoint visible para todo el equipo, no solo el proceso local (ver la discusión sobre punto único de falla en #chatia).

Ver `index.js` y `heartbeat.js` para los nombres exactos que lee `process.env`.

## Nota de seguridad (revisión adversarial, 2026-07-17)

Antes de exponer `/qr` por un túnel público (ver `DEPLOY.md`), confirmar:
- Los dos tokens de arriba están seteados con valores generados aleatoriamente (no vacíos, no reusados entre sí).
- El túnel se cierra apenas termine el escaneo — un token filtrado en logs del túnel o en el historial del navegador de quien escaneó sigue siendo válido hasta que se rote manualmente.
- `enviado_por` en `/send` solo acepta `JARVIS`/`ARIEL`/`SPIKE` o un nombre humano corto (2-60 caracteres) — no es una validación de identidad real (el token sigue siendo un secreto compartido, no una sesión por-usuario), es una barrera mínima contra basura/inyección en una columna de auditoría que lee todo el equipo.
