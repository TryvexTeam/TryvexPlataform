import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsRepository } from '@/lib/repos/leads'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { TareasRepository } from '@/lib/repos/tareas'
import { DashWorkspace } from '@/components/dashboard/dash-workspace'
import type { FeedItem } from '@/components/dashboard/dash-feed'
import type { DashStats } from '@/components/dashboard/dash-reader'
import type { Lead } from '@/lib/types/lead'

export const metadata = {
  title: 'Dashboard — Tryvex CRM',
  description: 'Centro de operaciones Tryvex. Gestiona leads, clientes, proyectos y tareas desde un solo lugar.',
}

/* ── Mapa estado → tag tone ── */
const estadoTone: Record<Lead['estado'], FeedItem['tagTone']> = {
  sin_contactar:    'cyan',
  contactado:       'cyan',
  interesado:       'amber',
  reunion_agendada: 'violet',
  ganado:           'violet',
  perdido:          'amber',
  descartado:       'amber',
}

/* ── Mapa estado → etiqueta legible ── */
const estadoLabel: Record<Lead['estado'], string> = {
  sin_contactar:    'Sin contactar',
  contactado:       'Contactado',
  interesado:       'Interesado',
  reunion_agendada: 'Reunión agendada',
  ganado:           'Ganado',
  perdido:          'Perdido',
  descartado:       'Descartado',
}

/* ── Color determinístico a partir del nombre ── */
function accentFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 60%, 58%)`
}

/* ── Iniciales ── */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (name[0] ?? '?').toUpperCase()
}

/* ── Tiempo relativo ── */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}sem`
}

/* ── Mapear Lead → FeedItem ── */
function leadToFeedItem(lead: Lead, index: number): FeedItem {
  return {
    id:       lead.id,
    name:     lead.nombre_negocio,
    initials: initials(lead.nombre_negocio),
    accent:   index === 0 ? 'gradient' : accentFromName(lead.nombre_negocio),
    when:     relativeTime(lead.created_at),
    tag:      lead.nicho?.toUpperCase() ?? lead.estado.toUpperCase().replace(/_/g, ' '),
    tagTone:  estadoTone[lead.estado],
    subject:  estadoLabel[lead.estado],
    snippet:  lead.info_texto ?? lead.notas ?? 'Sin descripción disponible.',
    unread:   lead.estado === 'sin_contactar',
    draft:    lead.notas ?? undefined,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [leads, clientes, proyectos, tareas] = await Promise.all([
    new LeadsRepository(supabase).list(),
    new ClientesRepository(supabase).list(),
    new ProyectosRepository(supabase).list(),
    new TareasRepository(supabase).list(),
  ])

  const stats = buildStats(leads, clientes, proyectos, tareas)

  // Máximo 20 leads más recientes para el feed del dashboard
  const items: FeedItem[] = leads.slice(0, 20).map(leadToFeedItem)

  return (
    <div className="h-full w-full">
      <DashWorkspace items={items} stats={stats} />
    </div>
  )
}

function buildStats(
  leads: Awaited<ReturnType<LeadsRepository['list']>>,
  clientes: Awaited<ReturnType<ClientesRepository['list']>>,
  proyectos: Awaited<ReturnType<ProyectosRepository['list']>>,
  tareas: Awaited<ReturnType<TareasRepository['list']>>
): DashStats {
  const unaSemanaAtras = Date.now() - 7 * 24 * 60 * 60 * 1000
  const hoy = new Date()
  const pendientes = tareas.filter((t) => t.estado !== 'listo')

  return {
    leads: {
      total: leads.length,
      nuevosSemana: leads.filter((l) => new Date(l.created_at).getTime() >= unaSemanaAtras).length,
      sinContactar: leads.filter((l) => l.estado === 'sin_contactar').length,
    },
    clientes: {
      activos: clientes.filter((c) => c.estado === 'activo').length,
      total: clientes.length,
    },
    proyectos: {
      enCurso: proyectos.filter((p) => ['brief', 'desarrollo', 'revision'].includes(p.estado)).length,
      entregasMes: proyectos.filter((p) => {
        if (!p.fecha_entrega) return false
        const f = new Date(p.fecha_entrega)
        return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth()
      }).length,
    },
    tareasPendientes: pendientes.slice(0, 6).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
    })),
    tareasPendientesTotal: pendientes.length,
  }
}
