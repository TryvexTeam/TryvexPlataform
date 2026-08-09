---
name: 2026-08-09-equipo-publico-landing
description: Conectado el equipo del CRM con /team de tryvex.tech vía vista pública v_equipo_publico; PR #69 abierto sin mergear, falta aplicar migración en producción
metadata:
  type: project
  area: feature
---

# Sesión 2026-08-09 — Equipo público en la landing

## Contexto de entrada

La landing (`tryvex.tech`, repo hermano `Tryvex-Landing`) tenía el equipo
hardcodeado en un array TS. La foto/bio de cada integrante vivía solo en el
CRM (`dim_integrantes`) y había que redeployar la landing a mano para
actualizarlas.

## Trabajo realizado

- **`supabase/migrations/040_equipo_publico_landing.sql`**: agrega a
  `dim_integrantes` las columnas `bio_corta`, `bio`, `linkedin`, `portfolio`,
  `category` (CHECK `core`/`engineering`), y crea la vista `v_equipo_publico`
  (`SELECT id, nombre, rol_principal AS role, bio_corta, bio,
  avatar_url AS photo, linkedin, portfolio, category FROM dim_integrantes
  WHERE activo = true`) con `GRANT SELECT ... TO anon`.
  - Decisión deliberada: `anon` nunca toca `dim_integrantes` directamente,
    solo la vista — sigue el criterio fijado en la migración 036 (cualquier
    exposición a `anon` en esta base es explícita, nunca por descuido). La
    vista corre con los permisos de quien la creó, así que no hace falta
    policy nueva en la tabla.

- **`lib/types/integrante.ts`**: `PerfilUpdateSchema` ganó los 5 campos
  nuevos. `UrlOpcionalSchema` (usada para `linkedin`/`portfolio`) tuvo que
  reforzarse: `z.string().url()` de Zod valida forma pero no protocolo, y
  dejaba pasar `"javascript:..."`. Fix: chequeo explícito de
  `new URL(v).protocol` contra `['http:', 'https:']`.

- **`components/settings/perfil-form.tsx`**: nueva sección "Ficha pública"
  (bio corta, bio, linkedin, portfolio, selector de categoría
  core/engineering) que guarda contra `PerfilUpdateSchema`.

- **PR abierto**: https://github.com/TryvexTeam/TryvexPlataform/pull/69,
  rama `feature/equipo-publico-landing`, sin mergear.

## Pendientes

1. Mergear PR #69.
2. Aplicar la migración `040_equipo_publico_landing.sql` en Supabase
   producción (fuera de alcance de este PR — requiere acceso de producción
   que el agente no tiene).
3. Configurar `SUPABASE_URL` / `SUPABASE_ANON_KEY` en el Vercel del repo
   `Tryvex-Landing` para que `/team` pueda leer `v_equipo_publico`.
4. Confirmar en `Tryvex-Landing` que el fetch a la vista reemplaza el array
   TS hardcodeado (no verificado en esta sesión — ese repo es hermano, no se
   tocó aquí).

## Aprendizajes (Auto-Blindaje)

- Antes de este PR no se corrían `especialista-db`/`revisor-codigo` de forma
  proactiva en cambios de este tipo (RLS/permisos, dato que cruza a un repo
  público). El bug de `javascript:...` en `UrlOpcionalSchema` lo encontró
  `especialista-db` en revisión de seguridad pre-merge, no un test ni un
  lint. **Regla fija ahora**: cualquier cambio en este repo que toque
  RLS/GRANT o que exponga datos a otro repo público pasa por
  `especialista-db` + `revisor-codigo` antes de abrir el PR.
- `verificador` confirmó: type-check OK; lint sin errores nuevos (los 23
  preexistentes no tocan archivos de este PR); build tuvo un OOM puntual en
  esa corrida por límite de heap del entorno — no es error de código, el
  build había pasado limpio antes en la misma sesión.
