# wa-bridge — variables de entorno

Crear un archivo `.env` en esta carpeta (nunca commitear el real — ya cubierto por el `.gitignore` del repo raíz) con estas claves:

- `WA_BRIDGE_DB_URL` — URL del proyecto Supabase de Tryvex (la misma que usa Next.js).
- `WA_BRIDGE_DB_SECRET` — la Service Role Key de Supabase (Project Settings → API → service_role, secreta). Este proceso no corre en el ciclo de request de Next.js, por eso necesita la key de servicio directamente en vez de la sesión del usuario. Se usa un nombre de variable propio de este servicio (no el mismo que usa la app principal) para poder rotarla sin tocar Next.js.
- `WA_BRIDGE_CHIP_ID` — identificador del número/chip de WhatsApp que usa este bridge (ej. `tryvex-principal`).
- `WA_BRIDGE_PORT` — puerto del servidor HTTP interno que expone `POST /send` (default 4600; Next.js le habla acá desde `app/api/wa/send/route.ts`).
- `WA_BRIDGE_INTERNAL_TOKEN` — token compartido simple para que solo Next.js pueda llamar a `/send`.
- `WA_BRIDGE_SEND_INTERVAL_MS` — ritmo de envío en ms entre mensajes salientes. Warm-up: empezar alto y bajar gradualmente. Acuerdo del equipo en #chatia: 1 mensaje/minuto = `60000`.
- `WA_BRIDGE_HEARTBEAT_WEBHOOK_URL` — a dónde reporta el vigía si la sesión de WhatsApp se cae. Endpoint visible para todo el equipo, no solo el proceso local (ver la discusión sobre punto único de falla en #chatia).

Ver `index.js` y `heartbeat.js` para los nombres exactos que lee `process.env`.
