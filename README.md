# Tryvex App

Sistema operativo interno de Tryvex. Reemplaza Notion como herramienta de gestión de leads, clientes, proyectos, tareas y wiki interna.

## Stack

- **Next.js 15** (App Router, TypeScript estricto)
- **Tailwind CSS v4** + **shadcn/ui** (new-york / neutral)
- **Supabase** (DB + Auth + Storage + Realtime)
- **@dnd-kit** para drag & drop
- **Zod** para validación
- **Anthropic SDK** para features IA (opcional)

## Setup local

### 1. Clonar e instalar dependencias

```bash
git clone <repo>
cd tryvex-app
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completar en `.env.local`:

| Variable | Dónde obtenerla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Mismo link, `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Mismo link, `service_role` (secreto) |
| `ANTHROPIC_API_KEY` | console.anthropic.com (opcional) |
| `SCRAPER_WEBHOOK_SECRET` | Generar con `openssl rand -hex 32` |

### 3. Correr en desarrollo

```bash
npm run dev
```

Abrir http://localhost:3000

## Comandos

```bash
npm run dev       # servidor de desarrollo con Turbopack
npm run build     # build de producción
npm run start     # servidor de producción
npm run lint      # linter
```

## Módulos

| Ruta | Descripción |
|---|---|
| `/dashboard` | KPIs + activity feed |
| `/leads` | Pipeline kanban de prospectos |
| `/clientes` | Clientes activos |
| `/proyectos` | Proyectos por estado |
| `/tareas` | Kanban de tareas del equipo |
| `/reuniones` | Reuniones con leads/clientes |
| `/cerebro` | Wiki interna (procesos, playbooks) |
| `/settings` | Perfil y configuración |

## Supabase

- **Proyecto:** tryvex-migracion
- **URL:** https://kmqozwcwttafvwhqlhkq.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/kmqozwcwttafvwhqlhkq
- 12 tablas con RLS habilitado
- Solo emails registrados en `dim_integrantes` pueden hacer signup

## Deploy en Vercel

1. Conectar repo en vercel.com
2. Agregar todas las env vars del `.env.example` en Vercel > Settings > Environment Variables
3. Deploy automático en cada push a `main`
"# tryvex-proyects" 
