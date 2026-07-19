# wa-bridge — despliegue

Corre como dos procesos separados, 24/7, en el VPS de Ariel/Cristian (medido 2026-07-17: 7.8GB RAM, 7.3GB libres — de sobra para este proceso + el scraper).

**Casa temporal, no definitiva.** Acordado en #chatia (2026-07-17, condición de Cristian, dueño real del VPS): este VPS destraba el 24/7 hoy sin tarjeta, pero cuando la infra definitiva del equipo (droplet propio u otra cuenta neutral) esté lista, esto se migra ahí. No asumir que es la casa final al configurar nada.

**Aislamiento obligatorio:** usuario Linux propio para este servicio (no compartir usuario con el scraper ni con ningún otro proceso del VPS), systemd separado, `MemoryMax` propio. El cerebro/núcleo de cada agente (memoria, identidad, credenciales privadas) NO vive acá — solo procesos acotados (este bridge, el scraper). Así ningún servicio puede leer los secretos de otro aunque compartan hardware.

- `index.js` — el puente en sí (WhatsApp Web + servidor HTTP `/send`, `/qr`, `/health`).
- `heartbeat.js` — el vigía. Corre como proceso **aparte** a propósito: si `index.js` se cuelga, el vigía sigue vivo y puede avisar por Discord.

**Antes de desplegar, leer la nota de seguridad al final de `ENV-SETUP.md`** — el proceso ahora falla al arrancar (a propósito) si faltan los tokens de autenticación.

## Primera vez (una sola vez por número)

```bash
cd wa-bridge
npm install
node index.js
```

Va a imprimir un QR en la terminal. Escanearlo con el teléfono del número de Tryvex (WhatsApp → Dispositivos vinculados). La sesión queda guardada en `./session/` — no hace falta volver a escanear salvo que se cierre sesión desde el teléfono o se borre esa carpeta.

Ver `ENV-SETUP.md` para las variables de entorno necesarias antes de arrancar.

## Producción — opción PM2 (recomendada, más simple)

```bash
npm install -g pm2
cd wa-bridge
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # deja pm2 arrancando solo al reiniciar la máquina
```

Comandos útiles: `pm2 logs tryvex-wa-bridge`, `pm2 restart tryvex-wa-bridge`, `pm2 status`.

## Producción — opción systemd (recomendada en el VPS de Ariel, comparte máquina con el scraper)

Crear `/etc/systemd/system/tryvex-wa-bridge.service`. `MemoryMax` es el limite duro: si este proceso (whatsapp-web.js levanta un Chromium) se desboca, el kernel lo mata a ÉL, no al resto de lo que corre en el VPS (el propio "cerebro" de Ariel, el scraper, etc.) — es la mitigación acordada en #chatia para compartir máquina sin blast radius cruzado.

```ini
[Unit]
Description=Tryvex WhatsApp bridge (Boton 2)
After=network.target

[Service]
Type=simple
WorkingDirectory=/ruta/a/wa-bridge
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
EnvironmentFile=/ruta/a/wa-bridge/.env
MemoryMax=1G
MemoryHigh=800M

[Install]
WantedBy=multi-user.target
```

Y `/etc/systemd/system/tryvex-wa-heartbeat.service` (mismo patrón, `ExecStart=/usr/bin/node heartbeat.js`, no necesita `MemoryMax` propio — es un proceso liviano de polling).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tryvex-wa-bridge tryvex-wa-heartbeat
sudo journalctl -u tryvex-wa-bridge -f   # logs en vivo
```

## Escaneo remoto del QR (Cristian, u otra persona que no esté en la máquina)

1. Levantar un túnel efímero apuntando al puerto local (no requiere cuenta ni tarjeta): `cloudflared tunnel --url http://localhost:4600`.
2. Cloudflared imprime una URL tipo `https://<random>.trycloudflare.com`. Pasarle a quien va a escanear: `https://<random>.trycloudflare.com/qr?token=<WA_BRIDGE_QR_TOKEN>`.
3. Que escanee con WhatsApp → Dispositivos vinculados, usando el número dedicado.
4. **Cerrar el túnel apenas `GET /health` muestre `sesionLista:true`** — no dejarlo abierto de más. Cerrar el túnel no revierte un dispositivo ya vinculado, así que la ventana de exposición real es "hasta que alguien escanee", no "hasta que se cierre el túnel" — ciérralo apenas puedas igual, es la única palanca que hay.

## Checklist antes de dar por vivo el puente

- [ ] `.env` completo, con `WA_BRIDGE_INTERNAL_TOKEN` y `WA_BRIDGE_QR_TOKEN` **distintos entre sí** (ver `ENV-SETUP.md`) — el proceso no arranca si faltan
- [ ] Migración `015_mensajes_wa_atribucion.sql` aplicada (OK de Ignacio/Adley) — ✅ ya corrida en producción, 2026-07-17
- [ ] `WA_BRIDGE_HEARTBEAT_WEBHOOK_URL` apuntando a un webhook de Discord real — sin esto el vigía corre pero no puede avisar a nadie
- [ ] `MemoryMax` seteado si comparte VPS con el scraper u otro proceso
- [ ] QR escaneado con el número dedicado de Tryvex (no un número personal) — ver "Escaneo remoto" arriba si quien escanea no está en la máquina
- [ ] Túnel cerrado apenas `sesionLista:true`
- [ ] Confirmar `GET /health` responde `{"ok":true,"sesionLista":true}`
