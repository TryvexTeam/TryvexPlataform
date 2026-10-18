<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:tryvex-agents -->
# Agentes del Proyecto — Tryvex App

## Stack
Next.js 16 · React 19 · Supabase · shadcn/ui · TypeScript · @dnd-kit · groq-sdk (Vex) · Zod · Sonner · Vaul

## Skills Locales Activos

Ubicados en `.claude/skills/`. Activar automáticamente según contexto:

| Skill | Trigger |
|-------|---------|
| `supabase-tryvex` | Operaciones DB, auth, repos, RLS |
| `nextjs-tryvex` | Route handlers, Server/Client components |
| `dnd-tryvex` | Kanban boards, drag & drop |
| `ai-features-tryvex` | Anthropic SDK, Claude models |
| `find-skill` | Tech sin skill local → buscar o crear |

## Arquetipos de Tarea para Este Proyecto

### BUILD — Nueva feature (entity, page, API)
```
INVESTIGAR: cerebro/index.md + lib/repos/[existente].ts (patrón)
SKILLS:     supabase-tryvex + nextjs-tryvex
RUTA:       lib/types/ → lib/repos/ → app/api/ → components/ → app/(app)/
VALIDAR:    npm run build + browser check
ENVIAR:     github-git (PR, nunca main)
```

### FIX — Bug, error, comportamiento inesperado
```
SKILLS:     skill local relevante al área
LOCALIZAR:  Grep en código relevante
VALIDAR:    npm run build
ENVIAR:     github-git (PR con descripción del fix)
```

### DATA — Schema Supabase, query nueva, migración
```
SKILLS:     supabase-tryvex
RUTA:       lib/types/database.ts → lib/repos/ → app/api/
NUNCA:      queries fuera de lib/repos/
```

### KANBAN — Nueva vista kanban o drag & drop
```
SKILLS:     dnd-tryvex + nextjs-tryvex
REUSAR:     components/shared/kanban-board.tsx (NO duplicar)
```

### AI — Feature con Claude
```
SKILLS:     ai-features-tryvex
RUTA:       app/api/claude/[feature]/route.ts
MODELO:     Haiku para clasificación, Sonnet para generación
CACHING:    Siempre prompt caching en system prompts > 1024 tokens
```

## Reglas Permanentes

1. NUNCA queries a Supabase fuera de `lib/repos/`
2. SIEMPRE tipos desde `lib/types/` — no tipos inline
3. SIEMPRE usar `params` como `Promise<{...}>` en Next.js 16
4. NUNCA push directo a main — siempre rama + PR
5. Kanban reutiliza `components/shared/kanban-board.tsx`
<!-- END:tryvex-agents -->
