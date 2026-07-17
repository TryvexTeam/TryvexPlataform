# scrapper-tryvex

Scraper de leads desde Google Maps enfocado en negocios de Santiago de Chile
sin sitio web pero con datos de contacto (teléfono o redes sociales).
Inserta resultados en Supabase. Se controla desde el dashboard `leads-dashboard`.

---

## Arquitectura

```
Google Maps
    │
    ▼
scraper.py  ──►  Supabase (tabla fact_leads)
    │
    └──►  notificaciones.py  ──►  Discord / Telegram / Slack / Notion
```

El scraper corre **3 categorías en paralelo** usando `asyncio.gather` + `Semaphore`.
Al arrancar escribe su PID en `scraper.pid`. Al terminar lo borra.
Para detenerlo desde el dashboard se crea un archivo `.stop` — el scraper lo detecta y para limpiamente.

---

## Setup en PC nuevo — guía paso a paso

> Seguí este orden exacto. Cada paso depende del anterior.

### 1. Instalar Python

- Descargá Python 3.13 desde **python.org** (NO desde Microsoft Store si podés evitarlo)
- Durante la instalación marcá **"Add Python to PATH"**
- Verificá: abrí PowerShell y corré `python --version`

> **Problema conocido con Microsoft Store Python:** el ejecutable queda en
> `C:\Users\<usuario>\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.13_...\python.exe`
> que es un App Execution Alias. Node.js no puede lanzarlo con `spawn("python", ...)` directamente.
> La solución: copiar la ruta completa del ejecutable real con:
> ```
> python -c "import sys; print(sys.executable)"
> ```
> y pegarla en `PYTHON_PATH` del `.env.local` del dashboard.

### 2. Clonar los repos

Ambos repos deben quedar como carpetas hermanas:

```
Desktop/
├── scrapper-tryvex/   ← este repo
└── leads-dashboard/   ← el dashboard
```

```bash
git clone https://github.com/Dela07/scrapper-tryvex.git
git clone https://github.com/Dela07/leads-dashboard.git
```

### 3. Instalar dependencias Python

```bash
cd scrapper-tryvex
pip install -r requirements.txt
```

### 4. Instalar Chromium para Playwright

```bash
python -m playwright install chromium
```

> ⚠️ El comando es `python -m playwright install chromium`, NO `playwright install chromium`.
> En Windows el segundo falla porque `playwright` no está en el PATH directamente.

### 5. Crear el archivo .env del scraper

Creá un archivo `.env` en la raíz de `scrapper-tryvex`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-service-role-key
HEADLESS=true
```

Las keys las sacás del proyecto Supabase en **Settings → API**.
Usá la **service_role key** (no la anon key).

> Las keys actuales están en el `.env.local` del dashboard como
> `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`.

### 6. Setup del dashboard

Ver README de `leads-dashboard`. En resumen:

```bash
cd leads-dashboard
npm install
# crear .env.local con las keys de Supabase + PYTHON_PATH
npm run dev
```

### 7. Verificar que funciona

```bash
python scraper.py --nicho dentistas --ciudad "Santiago de Chile" --cantidad 5
```

Deberías ver logs en consola y registros en Supabase.

---

## Uso desde el dashboard

El scraper se lanza desde `leads-dashboard` — sin necesidad de terminal.
El modal tiene:
- **Todos los nichos** — corre las 23 categorías en paralelo (3 a la vez)
- **Nicho específico** — solo esa categoría
- **Ciudad** y **cantidad por categoría**

## Uso por terminal

```bash
# Un nicho específico
python scraper.py --nicho dentistas --ciudad "Santiago de Chile" --cantidad 20

# Todas las categorías en paralelo
python scraper.py --cantidad 20
```

### Argumentos

| Argumento | Default | Descripción |
|-----------|---------|-------------|
| `--nicho` | (todas) | Categoría a scrapear. Sin este arg corre todas en paralelo. |
| `--ciudad` | `Santiago de Chile` | Ciudad para la búsqueda en Maps |
| `--cantidad` | `20` | Máximo de leads por categoría |

---

## Tabla en Supabase

Si el proyecto Supabase es nuevo, ejecutá este SQL en el **SQL Editor**:

```sql
create table if not exists public.fact_leads (
  id           bigserial primary key,
  nombre       text not null,
  telefono     text,
  info_texto   text,
  redes        text,
  tiene_web    boolean default false,
  nicho        text,
  score        integer default 0,
  estado       text default 'nuevo',
  rating       numeric,
  num_resenas  integer,
  direccion    text,
  horario      text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

grant all on public.fact_leads to service_role;
grant usage, select on sequence public.fact_leads_id_seq to service_role;
```

---

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `SUPABASE_KEY` | Sí | Service role key de Supabase |
| `HEADLESS` | No | `true` (default) / `false` para ver el browser |
| `DISCORD_WEBHOOK_URL` | No | Notificaciones Discord |
| `TELEGRAM_BOT_TOKEN` | No | Token bot Telegram |
| `TELEGRAM_CHAT_ID` | No | Chat ID Telegram |

---

## Lógica de score

| Dato | Puntos |
|------|--------|
| Teléfono | +50 |
| Redes sociales | +30 |
| Descripción | +20 |
| Rating < 4.0 | +15 |
| Reseñas < 20 | +10 |

---

## Categorías (23)

restaurantes, peluquerías, dentistas, tiendas de ropa, talleres mecánicos,
farmacias, gimnasios, panaderías, ferreterías, veterinarias, cafeterías,
pizzerías, barberías, centros de estética, electricistas, contadores,
abogados, psicólogos, kinesiólogos, ópticas, librerías, florerías, joyerías.

---

## Notas técnicas

- Delays de 0.5–1.2 s entre negocios (anti-ban)
- Scroll reducido: 4 pasadas × 0.6 s = 2.4 s por categoría
- Deduplicación por `(nombre, nicho)` — upsert que preserva el estado del lead
- Logs en `scraper.log` y consola
- `.env`, `scraper.log`, `scraper.pid` y `.stop` están en `.gitignore`
