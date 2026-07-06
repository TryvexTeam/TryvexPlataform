# Sistema PRP (Product Requirements Proposal) — Tryvex App

> **Los Blueprints de Jarvis** — Contrato humano-IA antes de escribir código

---

## Qué es un PRP

Un PRP es el **blueprint de una feature**. Define QUÉ construir antes de escribir una sola línea de código.

| Sección | Propósito | Responsable |
|---------|-----------|-------------|
| **Objetivo** | Qué se construye (estado final) | Humano define |
| **Por Qué** | Valor de negocio | Humano define |
| **Qué** | Comportamiento + criterios de éxito | Humano + IA |
| **Contexto** | Docs, referencias, código existente | IA investiga |
| **Blueprint** | Fases de implementación (sin subtareas) | IA genera |
| **Aprendizajes** | Auto-Blindaje — errores y fixes | IA actualiza |

---

## Flujo de Trabajo

```
1. Señor Ignacio: "Necesito [feature]"
2. Jarvis: Investiga contexto en el codebase
3. Jarvis: Genera PRP-XXX-nombre.md usando este template
4. Señor Ignacio: Revisa y aprueba
5. Jarvis: Ejecuta Blueprint fase por fase (/bucle-agentico)
6. Jarvis: Documenta aprendizajes en el PRP (Auto-Blindaje)
```

---

## Nomenclatura

- Archivos: `PRP-[NUMERO]-[descripcion-kebab].md`
- Estados: `PENDIENTE` → `APROBADO` → `EN PROGRESO` → `COMPLETADO`

---

# TEMPLATE PRP

```markdown
# PRP-XXX: [Título]

> **Estado**: PENDIENTE
> **Fecha**: YYYY-MM-DD
> **Proyecto**: Tryvex App

---

## Objetivo

[Qué se construye — estado final deseado en 1-2 oraciones]

## Por Qué

| Problema | Solución |
|----------|----------|
| [Dolor del usuario] | [Cómo lo resuelve esta feature] |

**Valor de negocio**: [Impacto medible]

## Qué

### Criterios de Éxito
- [ ] [Criterio medible 1]
- [ ] [Criterio medible 2]
- [ ] [Criterio medible 3]

### Comportamiento Esperado
[Descripción del flujo principal — Happy Path]

---

## Contexto

### Referencias
- `lib/repos/[existente].ts` — Patrón de repo a seguir
- `components/shared/kanban-board.tsx` — Si aplica drag & drop

### Arquitectura Propuesta
```
components/[feature]/
├── [feature]-lista.tsx
├── [feature]-detalle.tsx
└── [feature]-form.tsx

lib/repos/[feature].ts
lib/types/[feature].ts
app/api/[feature]/route.ts
app/(app)/[feature]/page.tsx
```

### Modelo de Datos (si aplica)
```sql
CREATE TABLE [tabla] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo definir FASES. Las subtareas se generan al entrar a cada fase
> con el skill /bucle-agentico (mapear contexto → generar subtareas → ejecutar)

### Fase 1: [Nombre]
**Objetivo**: [Qué se logra al completar esta fase]
**Validación**: [Cómo verificar que está completa]

### Fase 2: [Nombre]
**Objetivo**: [Qué se logra]
**Validación**: [Cómo verificar]

### Fase N: Validación Final
**Objetivo**: Sistema funcionando end-to-end
**Validación**:
- [ ] npm run build exitoso
- [ ] Flujo funciona en browser (localhost:3000)
- [ ] Criterios de éxito cumplidos

---

## Aprendizajes (Auto-Blindaje)

> Esta sección CRECE con cada error encontrado durante la implementación.
> El mismo error NUNCA ocurre dos veces.

### [YYYY-MM-DD]: [Título del aprendizaje]
- **Error**: [Qué falló]
- **Fix**: [Cómo se arregló]
- **Aplicar en**: [Dónde más aplica]

---

## Gotchas

- [ ] Supabase SSR: usar `server.ts` en Server Components, `client.ts` en Client Components
- [ ] Next.js 16: verificar APIs antes de usar — rompe con versiones previas
- [ ] DND-Kit: `@dnd-kit/sortable` requiere `SortableContext` con `items` array

## Anti-Patrones

- NO queries a Supabase fuera de `lib/repos/`
- NO tipos inline — siempre `lib/types/`
- NO duplicar lógica kanban — reutilizar `components/shared/kanban-board.tsx`
- NO ignorar errores de TypeScript

---

*PRP pendiente aprobación. No se ha modificado código.*
```
