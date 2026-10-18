# Vitrinas del dashboard (Fase 3 — vista Equipo)

Reciben TODO por props: no consultan repos ni permisos. Toleran datos vacíos o en cero.

## `vitrina-funnel.tsx` — Server
`{ estados: { id: string; label: string; color: string; count: number }[]; titulo?: string }`
SVG `role="img"` + lista textual equivalente. Colores desde `ESTADOS_LEAD` (`lib/types/lead.ts`).
```tsx
import VitrinaFunnel from '@/components/dashboard/vitrina-funnel'
const estados = ESTADOS_LEAD.map((e) => ({ ...e, count: conteos[e.id] ?? 0 }))
<VitrinaFunnel estados={estados} />
```

## `presencia-strip.tsx` — Client
`{ integrantes: { nombre: string; estado: EstadoPresencia }[]; titulo?: string }`
`EstadoPresencia` de `lib/types/presencia.ts` (el diseño lo llamaba `PresenciaEstado`; ese nombre
no existe). Labels/colores de `PRESENCIA_LABEL` / `PRESENCIA_COLOR`. Scroll horizontal con snap.
```tsx
import PresenciaStrip from '@/components/dashboard/presencia-strip'
const integrantes = presencias.map((p) => ({ nombre: p.nombre, estado: p.estado }))
<PresenciaStrip integrantes={integrantes} />
```

## `ranking-barras.tsx` — Server
`{ filas: { label: string; valor: number; max: number; color?: string }[]; titulo: string }`
`color` por defecto `var(--tx-accent)`. Cada barra muestra label y cifra.
```tsx
import RankingBarras from '@/components/dashboard/ranking-barras'
const filas = ranking.map((r) => ({ label: r.nombre, valor: r.completadas, max: tope }))
<RankingBarras filas={filas} titulo="Tareas completadas" />
```

## `tile-saldo.tsx` — Server
`{ saldo: number; mesAnterior?: number; moneda?: string }`
Formato es-CL (`formatearCLP`). Renderizarlo SÓLO con permiso: no chequea nada.
```tsx
import TileSaldo from '@/components/dashboard/tile-saldo'
{puede(perfil, 'ver_finanzas') && <TileSaldo saldo={r.saldo} mesAnterior={prev?.saldo} />}
```
