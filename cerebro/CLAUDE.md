# cerebro — Sistema Wiki Local (Tryvex App)

> LLM Wiki basado en el patrón Karpathy. Recuperación O(índice), no O(todos los archivos).

## Estructura

```
cerebro/
├── CLAUDE.md     — Este archivo: reglas del wiki
├── index.md      — Catálogo de nodos (leer primero)
├── log.md        — Bitácora append-only
├── sources.md    — Referencias externas y archivos clave
└── sessions/     — Un .md por sesión significativa
```

## Reglas de Uso

**Al iniciar sesión de trabajo:**
1. Leer `cerebro/index.md` — carga contexto previo en O(índice)
2. Abrir solo los nodos relevantes al área de trabajo

**Al terminar sesión significativa:**
- Crear `cerebro/sessions/YYYY-MM-DD-[tema].md` con decisiones, outputs, pendientes
- Actualizar `cerebro/index.md` con el nuevo nodo

**Para buscar conocimiento acumulado:**
- Leer `cerebro/index.md` → identificar nodo relevante → leer ese nodo

## Formato de Nodo de Sesion

```markdown
---
name: YYYY-MM-DD-[tema]
description: [Una línea: qué se hizo y qué quedó pendiente]
metadata:
  type: project
  area: [dev|design|ops|fix|feature]
---

# Sesión YYYY-MM-DD — [Tema]

## Contexto de entrada
[Estado del proyecto al empezar]

## Trabajo realizado
[Decisiones técnicas, archivos tocados, patrones establecidos]

## Pendientes
[Lista numerada de próximos pasos]

## Aprendizajes (Auto-Blindaje)
[Errores encontrados y cómo se resolvieron]
```

## Economía de Tokens

- `index.md` es el único archivo que se lee en CADA sesión
- Los nodos individuales solo se leen cuando son relevantes
- Esto evita releer todo el historial en cada mensaje
