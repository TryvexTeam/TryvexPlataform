import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsRepository } from '@/lib/repos/leads'
import { TareasRepository } from '@/lib/repos/tareas'
import { HoySeccion } from '@/components/hoy/hoy-seccion'
import type { HoyItem } from '@/components/hoy/hoy-seccion'
import type { Lead } from '@/lib/types/lead'
import type { TareaConResponsables } from '@/lib/types/tarea'

export const metadata = {
  title: 'Hoy — Tryvex CRM',
}

/* ── Helpers ── */

const MS_PER_DAY = 86_400_000

function daysDiff(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / MS_PER_DAY)
}

function fechaRelativa(fechaStr: string, hoy: Date): string {
  const fecha = new Date(fechaStr)
  const diffMs = fecha.getTime() - hoy.getTime()
  // Normalize to start-of-day comparison
  const fechaDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  const hoyDay = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const diffDays = Math.round((fechaDay.getTime() - hoyDay.getTime()) / MS_PER_DAY)

  if (diffDays === 0) return 'hoy'
  if (diffDays === 1) return 'mañana'
  if (diffDays < 0) return `vencida hace ${Math.abs(diffDays)}d`
  return `en ${diffDays}d`
}

const PRIORIDAD_BADGE: Record<string, { color: string }> = {
  alta:  { color: '#ef4444' },
  media: { color: '#f59e0b' },
  baja:  { color: '#22c55e' },
}

function sortByScoreDesc(a: Lead, b: Lead): number {
  if (a.score === null && b.score === null) return 0
  if (a.score === null) return 1
  if (b.score === null) return -1
  return b.score - a.score
}

/* ── Page ── */

export default async function HoyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [allLeads, allTareas] = await Promise.all([
    new LeadsRepository(supabase).list(),
    new TareasRepository(supabase).list(),
  ])

  const ahora = new Date()
  const tresDiasAtras = new Date(ahora.getTime() - 3 * MS_PER_DAY)
  const sieteDiasAtras = new Date(ahora.getTime() - 7 * MS_PER_DAY)
  const dosDiasDespues = new Date(ahora.getTime() + 2 * MS_PER_DAY)

  /* ── Sección 1: Leads enfriándose ── */
  const leadsEnfriandose = allLeads
    .filter((l) => {
      if (l.estado !== 'sin_contactar' && l.estado !== 'contactado') return false
      return new Date(l.updated_at) <= tresDiasAtras
    })
    .sort(sortByScoreDesc)

  const itemsEnfriandose: HoyItem[] = leadsEnfriandose.map((l) => ({
    id: l.id,
    label: l.nombre_negocio,
    sublabel: `${daysDiff(l.updated_at, ahora)} días sin tocar`,
    href: `/leads?lead=${l.id}`,
    badge: l.score !== null
      ? { text: String(l.score), color: 'var(--tx-accent)' }
      : undefined,
    metaRight: l.estado === 'sin_contactar' ? 'Sin contactar' : 'Contactado',
  }))

  /* ── Sección 2: Tareas que vencen ── */
  const tareasVencen = allTareas
    .filter((t: TareaConResponsables) => {
      if (t.estado === 'listo') return false
      if (!t.fecha_limite) return false
      return new Date(t.fecha_limite) <= dosDiasDespues
    })
    .sort((a: TareaConResponsables, b: TareaConResponsables) => {
      return new Date(a.fecha_limite!).getTime() - new Date(b.fecha_limite!).getTime()
    })

  const itemsTareas: HoyItem[] = tareasVencen.map((t: TareaConResponsables) => ({
    id: t.id,
    label: t.titulo,
    sublabel: fechaRelativa(t.fecha_limite!, ahora),
    href: '/tareas',
    badge: {
      text: t.prioridad,
      color: PRIORIDAD_BADGE[t.prioridad]?.color ?? '#94a3b8',
    },
  }))

  /* ── Sección 3: Sin contactar nuevos ── */
  const sinContactarNuevos = allLeads
    .filter((l) => {
      if (l.estado !== 'sin_contactar') return false
      return new Date(l.created_at) >= sieteDiasAtras
    })
    .sort(sortByScoreDesc)
    .slice(0, 10)

  const itemsNuevos: HoyItem[] = sinContactarNuevos.map((l) => ({
    id: l.id,
    label: l.nombre_negocio,
    sublabel: l.nicho ?? l.localidad ?? 'Lead nuevo',
    href: `/leads?lead=${l.id}`,
    badge: l.score !== null
      ? { text: String(l.score), color: 'var(--tx-accent)' }
      : undefined,
    metaRight: `hace ${daysDiff(l.created_at, ahora)}d`,
  }))

  return (
    <div
      style={{
        maxWidth: '820px',
        margin: '0 auto',
        padding: '32px 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: '4px' }}>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--tx-ink-primary)',
            margin: '0 0 4px',
          }}
        >
          Hoy
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--tx-ink-muted)',
            margin: 0,
          }}
        >
          ¿Qué tengo que hacer ahora?
        </p>
      </div>

      <HoySeccion
        titulo="Leads enfriándose"
        icon="flame"
        items={itemsEnfriandose}
        emptyMessage="Nada enfriándose"
        emptyEmoji="🎉"
        emptyAction={{ label: 'Ver leads', href: '/leads' }}
      />

      <HoySeccion
        titulo="Tareas que vencen"
        icon="calendar-clock"
        items={itemsTareas}
        emptyMessage="Sin tareas urgentes"
        emptyEmoji="✅"
        emptyAction={{ label: 'Ver tareas', href: '/tareas' }}
      />

      <HoySeccion
        titulo="Sin contactar nuevos"
        icon="user-plus"
        items={itemsNuevos}
        emptyMessage="No hay leads nuevos sin contactar"
        emptyEmoji="📭"
        emptyAction={{ label: 'Crear lead', href: '/leads' }}
      />
    </div>
  )
}
