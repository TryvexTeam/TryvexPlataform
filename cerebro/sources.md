# sources — Referencias del Proyecto

> Punteros a archivos clave y recursos externos.

## Archivos Core del Proyecto

| Archivo | Propósito |
|---------|-----------|
| `lib/supabase/server.ts` | Cliente Supabase para server-side |
| `lib/supabase/client.ts` | Cliente Supabase para browser |
| `lib/supabase/middleware.ts` | Auth middleware |
| `lib/types/database.ts` | Tipos generados de Supabase DB |
| `components/shared/kanban-board.tsx` | KanbanBoard reutilizable |
| `app/(app)/layout.tsx` | Layout del área autenticada |
| `proxy.ts` | Proxy configuration |

## Repos Pattern

| Repo | Entidad |
|------|---------|
| `lib/repos/leads.ts` | Lead CRM |
| `lib/repos/clientes.ts` | Cliente |
| `lib/repos/proyectos.ts` | Proyecto |
| `lib/repos/tareas.ts` | Tarea + subtareas |

## Variables de Entorno Requeridas

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

## Documentación Relevante

- Next.js 16: `node_modules/next/dist/docs/`
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side
- DND-Kit: https://docs.dndkit.com/
- shadcn/ui: https://ui.shadcn.com/docs
- Anthropic SDK: https://docs.anthropic.com/
