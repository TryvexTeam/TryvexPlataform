# Deploy del scraper — VPS de Ariel (temporal del equipo, 17-jul-2026)

El scraper corre 24/7 en el VPS `179.197.224.95` (7.8GB, compartido con el
cerebro de Ariel y el bridge de WhatsApp de Spike). **Es temporal**: cuando el
equipo destrabe una cuenta/infra propia, se muda ahí (misma lógica que el tablero
neutral — no depender de una persona).

## Cómo está montado
- **Usuario dedicado:** `scraper` (aislado; NO puede leer los secretos del cerebro
  de Ariel ni del bridge — cada servicio con su usuario).
- **Ubicación:** `/opt/scraper/` · venv en `.venv/` · Chromium de Playwright en
  `/home/scraper/.cache/ms-playwright/`.
- **Config:** `/opt/scraper/.env` (chmod 600, dueño scraper). Apunta a la Supabase
  del CRM (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`), `HEADLESS=true`,
  `SCRAPER_CONCURRENCIA=2` (bajo, para no ahogar el bridge — dos Chromium en la máquina).
- **systemd:** `tryvex-scraper.service` (oneshot, `MemoryMax=1536M`) +
  `tryvex-scraper.timer` (diario 07:00 UTC). El `MemoryMax` es el blast radius:
  si se desboca, el kernel mata al scraper, no al cerebro de Ariel.

## Operar
```
systemctl start tryvex-scraper.service     # correr ya (todas las categorías)
systemctl status tryvex-scraper.service    # estado de la última corrida
journalctl -u tryvex-scraper.service -n50  # log
systemctl list-timers tryvex-scraper.timer # próxima corrida
```
A demanda con parámetros (como usuario scraper):
```
su scraper -c 'cd /opt/scraper && .venv/bin/python scraper.py --nicho "barberías" --cantidad 5 --concurrencia 1'
```

## Actualizar el código
```
scp scraper.py crm_map.py notificaciones.py root@179.197.224.95:/opt/scraper/
ssh root@179.197.224.95 'chown scraper:scraper /opt/scraper/*.py'
```
(Cuando el CRM tenga integración git/deploy, esto se automatiza.)

## Pendientes
- **Migración 016 (`scraper_runs`):** correr en la Supabase del CRM para habilitar la
  telemetría de corridas (sin ella el scraper igual escribe los leads; solo pierde el
  registro "cuándo corrió / cuánto trajo"). El dashboard de control la lee.
- **Control desde el CRM** (arrancar/parar/ver desde la web): Fase 2, la vista de
  Jarvis — endpoints Next.js que le hablan al scraper (patrón del panel de WhatsApp).
