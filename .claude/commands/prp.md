# /prp — Generar PRP para Tryvex App

> Genera un Product Requirements Proposal (blueprint de feature)
> Uso: `/prp [descripción de la feature]`

---

## Lo que hace este comando

1. Lee el template en `.claude/PRPs/prp-base.md`
2. Investiga el codebase para entender contexto actual
3. Genera `PRP-XXX-[feature-name].md` en `.claude/PRPs/`
4. Presenta resumen al señor Ignacio para aprobación

**NO implementa código** — solo genera el blueprint.

---

## Proceso

### 1. Investigar codebase

Antes de generar el PRP, buscar:
- Archivos relacionados con la feature (`Grep`, `Glob`)
- Patrones existentes similares (repos, components, types)
- Dependencias relevantes en `package.json`

### 2. Número secuencial

Revisar PRPs existentes en `.claude/PRPs/` para asignar el siguiente número:
```
ls .claude/PRPs/PRP-*.md
```

### 3. Generar el PRP

Crear `.claude/PRPs/PRP-[NNN]-[feature-kebab].md` siguiendo el template de `prp-base.md`.

Rellenar con contexto real del codebase:
- Archivos que se van a modificar (con paths reales)
- Modelo de datos (si implica cambios en Supabase)
- Fases de implementación ordenadas por dependencia

### 4. Presentar resumen

Mostrar al señor Ignacio:
- Objetivo en 1 oración
- N fases (nombres)
- Archivos principales afectados
- Preguntar si quiere ajustar

---

## Después del PRP

Una vez aprobado: `/bucle-agentico` ejecuta las fases una por una.
