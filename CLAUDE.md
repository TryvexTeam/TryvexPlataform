@AGENTS.md

# Tryvex App — Instrucciones del Proyecto

> Next.js 16 · React 19 · Supabase · shadcn/ui · TypeScript
> CRM inteligente: Leads → Clientes → Proyectos → Tareas

---

## Stack y Contexto

| Capa | Tech |
|------|------|
| Framework | Next.js 16.2.6 (App Router) |
| UI | React 19 + shadcn/ui + Tailwind v4 |
| DB + Auth | Supabase (PostgreSQL + SSR) |
| Drag&Drop | @dnd-kit (kanban boards) |
| IA | groq-sdk (Vex: score leads, mensajes, resúmenes) |
| Validación | Zod v4 |
| Toast | Sonner |
| Drawer | Vaul |
| Íconos | lucide-react |

## ⚠️ Next.js 16 — ROMPE con versiones anteriores

Leer `node_modules/next/dist/docs/` antes de usar APIs de Next.js.
El App Router tiene cambios importantes en 16.x — no asumir comportamiento de versiones previas.

---

## Estructura del Proyecto

```
app/
├── (app)/          — Layout autenticado: dashboard, leads, clientes, proyectos, tareas
├── (auth)/         — Login, signup
├── api/            — Route handlers (REST endpoints)
└── layout.tsx      — Root layout

components/
├── ui/             — shadcn/ui primitivos
├── layout/         — Sidebar + Topbar
├── leads/          — Pipeline kanban + formularios
├── clientes/       — Lista + detalle + formulario
├── proyectos/      — Kanban + detalle + formulario
├── tareas/         — Kanban + detalle + formulario
└── shared/         — KanbanBoard reutilizable

lib/
├── supabase/       — client.ts, server.ts, middleware.ts
├── repos/          — Repository pattern: leads, clientes, proyectos, tareas
├── types/          — Types TS: Lead, Cliente, Proyecto, Tarea, Database
└── utils.ts        — cn() helper

cerebro/            — Wiki local del proyecto (leer index.md primero)
.claude/
├── settings.json   — Permisos + hooks del proyecto
├── PRPs/           — Blueprints de features
├── skills/         — Skills locales del proyecto
└── commands/       — Slash commands del proyecto
```

---

## Patrones Obligatorios

### Repository Pattern
Toda operación de DB va en `lib/repos/`. Los route handlers llaman repos, no Supabase directamente.

### API Response Format
```ts
return NextResponse.json({ success: true, data: result })
return NextResponse.json({ success: false, error: message }, { status: 400 })
```

### Supabase
- Server Components / Route Handlers → `lib/supabase/server.ts`
- Client Components → `lib/supabase/client.ts`

### Estado de Leads
`sin_contactar` → `contactado` → `interesado` → `reunion_agendada` → `ganado` | `perdido` (con `razon_perdida`)
`descartado` = lead que nunca calificó (distinto de `perdido`, que avanzó y se cayó)

---

## Comandos

```bash
npm run dev       # localhost:3000
npm run build     # build de producción
npm run lint      # ESLint
```

---

## Skills (`.claude/skills/`)

Ver índice completo en `.claude/skills/SKILLS-INDEX.md` — +1400 skills disponibles.

Skills locales prioritarios:

| Skill | Cuándo activar |
|-------|---------------|
| `@supabase-tryvex` | Operaciones de DB o auth |
| `@nextjs-tryvex` | Route handlers, components |
| `@dnd-tryvex` | Kanban, drag & drop |
| `@ai-features-tryvex` | Anthropic SDK integrations |
| `@find-skill` | Buscar skill para tech no cubierta |

Skills globales de uso frecuente en este proyecto:
`@react-best-practices` · `@shadcn` · `@tailwind-patterns` · `@typescript-expert` · `@zod-validation-expert` · `@playwright-skill` · `@vercel-deployment` · `@web-accessibility` · `@security-audit` · `@claude-api`

---

## Reglas del Proyecto

1. **NUNCA** queries a Supabase fuera de `lib/repos/`
2. **SIEMPRE** tipos desde `lib/types/` — no definir tipos inline
3. **Kanban** reutiliza `components/shared/kanban-board.tsx`
4. **Auth** en `lib/supabase/middleware.ts` — protege `(app)/`
5. **No** duplicar lógica entre leads/proyectos/tareas kanban

---

## Sistema PRP + Bucle Agéntico

```
/prp [descripción]    → Genera .claude/PRPs/PRP-XXX-feature.md
/bucle-agentico       → Ejecuta el PRP fase por fase
```

---

## Cerebro del Proyecto

Wiki local en `cerebro/`. Leer `cerebro/index.md` al inicio de sesiones significativas.
