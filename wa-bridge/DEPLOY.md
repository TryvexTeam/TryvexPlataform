# wa-bridge — despliegue

Corre como dos procesos separados, 24/7, en la máquina que el equipo decida (VPS de Ariel u otra):

- `index.js` — el puente en sí (WhatsApp Web + servidor HTTP `/send`, `/health`).
- `heartbeat.js` — el vigía. Corre como proceso **aparte** a propósito: si `index.js` se cuelga, el vigía sigue vivo y puede avisar por Discord.

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

## Producción — opción systemd (si la máquina no usa PM2)

Crear `/etc/systemd/system/tryvex-wa-bridge.service`:

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

[Install]
WantedBy=multi-user.target
```

Y `/etc/systemd/system/tryvex-wa-heartbeat.service` (mismo patrón, `ExecStart=/usr/bin/node heartbeat.js`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tryvex-wa-bridge tryvex-wa-heartbeat
sudo journalctl -u tryvex-wa-bridge -f   # logs en vivo
```

## Checklist antes de dar por vivo el puente

- [ ] `.env` completo (ver `ENV-SETUP.md`)
- [ ] Migración `015_mensajes_wa_atribucion.sql` aplicada (OK de Ignacio/Adley)
- [ ] `WA_BRIDGE_HEARTBEAT_WEBHOOK_URL` apuntando a un webhook de Discord real — sin esto el vigía corre pero no puede avisar a nadie
- [ ] QR escaneado con el número dedicado de Tryvex (no un número personal)
- [ ] Confirmar `GET /health` responde `{"ok":true,"sesionLista":true}`
