'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, CalendarDays, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ProyectoForm, type IntegranteElegible } from './proyecto-form'
import type { Proyecto, ProyectoInsert } from '@/lib/types/proyecto'
import type { Cliente } from '@/lib/types/cliente'
import { ESTADOS_PROYECTO } from '@/lib/types/proyecto'
import { cn } from '@/lib/utils'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'

interface ProyectosKanbanProps {
  initialProyectos: Proyecto[]
  clientes: Cliente[]
  integrantes?: IntegranteElegible[]
}

/** Mismo criterio que tarea-card.tsx: chip translúcido, color con más cuerpo
 *  que el texto plano. Un color por tipo, no por estado (el estado ya es la
 *  columna donde vive la tarjeta — repetirlo en la tarjeta sería ruido). */
const TIPO_PROYECTO_CONFIG = {
  landing:        { label: 'Landing',        style: { background: 'oklch(68% 0.18 230 / 10%)', color: 'oklch(75% 0.14 230)', border: '1px solid oklch(68% 0.18 230 / 22%)' } },
  automatizacion: { label: 'Automatización',  style: { background: 'oklch(58% 0.24 292 / 10%)', color: 'oklch(72% 0.18 292)', border: '1px solid oklch(58% 0.24 292 / 22%)' } },
  mantencion:     { label: 'Mantención',      style: { background: 'oklch(72% 0.17 145 / 10%)', color: 'oklch(78% 0.14 145)', border: '1px solid oklch(72% 0.17 145 / 22%)' } },
  otro:           { label: 'Otro',            style: { background: 'oklch(100% 0 0 / 5%)',       color: 'oklch(65% 0 0)',      border: '1px solid oklch(100% 0 0 / 10%)' } },
} as const

function ProyectoCard({
  proyecto,
  responsable,
  onClick,
}: {
  proyecto: Proyecto
  responsable?: IntegranteElegible
  onClick?: () => void
}) {
  const progreso = proyecto.horas_estimadas && proyecto.horas_reales
    ? Math.min(100, Math.round((proyecto.horas_reales / proyecto.horas_estimadas) * 100))
    : null

  const activo = proyecto.estado !== 'entregado' && proyecto.estado !== 'cerrado'
  const vencido = activo && !!proyecto.fecha_entrega && new Date(proyecto.fecha_entrega) < new Date()

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-3 cursor-pointer select-none transition-all duration-150"
      style={{
        background: vencido ? 'oklch(63% 0.21 22 / 6%)' : 'oklch(10% 0.004 240)',
        border: vencido ? '1px solid oklch(63% 0.21 22 / 25%)' : '1px solid var(--tx-border)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        if (!vencido) (e.currentTarget as HTMLElement).style.border = '1px solid oklch(100% 0 0 / 12%)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        if (!vencido) (e.currentTarget as HTMLElement).style.border = '1px solid var(--tx-border)'
      }}
    >
      {/* Tipo + costo */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
          style={TIPO_PROYECTO_CONFIG[proyecto.tipo].style}
        >
          {TIPO_PROYECTO_CONFIG[proyecto.tipo].label}
        </span>
        {proyecto.costo_total_usd && (
          <span className="text-[11px] font-semibold tabular-nums truncate" style={{ color: 'var(--tx-ink-secondary)' }}>
            ${proyecto.costo_total_usd.toLocaleString()}
          </span>
        )}
      </div>

      {/* Título + cliente */}
      <p className="text-[13px] font-medium leading-snug mb-0.5 line-clamp-2" style={{ color: 'var(--tx-ink-primary)' }}>
        {proyecto.nombre}
      </p>
      {proyecto.cliente && (
        <p className="text-[11px] truncate mb-2.5" style={{ color: 'var(--tx-ink-muted)' }}>
          {proyecto.cliente.nombre_contacto ?? proyecto.cliente.nombre_negocio}
        </p>
      )}

      {/* Progreso de horas: acento del CRM, no un azul suelto de otra paleta */}
      {progreso !== null && (
        <div className="mb-2.5">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--tx-surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${progreso}%`, background: 'var(--tx-accent)' }} />
          </div>
          <p className="text-[10px] tabular-nums mt-1" style={{ color: 'var(--tx-ink-muted)' }}>
            {proyecto.horas_reales}h / {proyecto.horas_estimadas}h
          </p>
        </div>
      )}

      {/* Footer: entrega + responsable */}
      <div className="flex items-center justify-between">
        {proyecto.fecha_entrega ? (
          <span
            className="flex items-center gap-0.5 text-[10px]"
            style={{ color: vencido ? 'oklch(72% 0.17 22)' : 'var(--tx-ink-muted)' }}
          >
            {vencido ? <AlertCircle size={10} /> : <CalendarDays size={10} />}
            {format(new Date(proyecto.fecha_entrega), 'd MMM', { locale: es })}
          </span>
        ) : (
          <span />
        )}

        {responsable && (
          <Avatar className="h-5 w-5" style={{ border: '1.5px solid var(--tx-bg-primary)' }}>
            <AvatarImage src={responsable.avatar_url ?? undefined} />
            <AvatarFallback className="text-[8px] font-bold" style={{ background: 'var(--tx-surface-2)', color: 'var(--tx-ink-secondary)' }}>
              {responsable.nombre.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}

export function ProyectosKanban({ initialProyectos, clientes, integrantes = [] }: ProyectosKanbanProps) {
  // Mantiene proyectos al día sin recargar.
  useDatosVivos(['dim_proyectos', 'tareas'])

  const router = useRouter()
  const [proyectos, setProyectos] = useState<Proyecto[]>(initialProyectos)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => { setProyectos(initialProyectos) }, [initialProyectos])

  const integrantePorId = new Map(integrantes.map((i) => [i.id, i]))

  const columns = ESTADOS_PROYECTO.map((e) => ({
    id: e.id,
    title: e.label,
    color: e.color,
    items: proyectos.filter((p) => p.estado === e.id),
  }))

  async function handleDragEnd(itemId: string, _from: string, toCol: string) {
    const estado = toCol as Proyecto['estado']
    setProyectos((p) => p.map((pr) => pr.id === itemId ? { ...pr, estado } : pr))

    const res = await fetch(`/api/proyectos/${itemId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) {
      toast.error('Error al mover el proyecto')
      setProyectos(initialProyectos)
    }
  }

  async function handleCreate(data: ProyectoInsert, integrantesIds: string[]) {
    const res = await fetch('/api/proyectos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, integrantes_ids: integrantesIds }),
    })
    if (!res.ok) throw new Error()
    toast.success('Proyecto creado')
    router.refresh()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Proyectos</h1>
          <p className="text-sm text-[var(--tx-ink-muted)] mt-0.5">{proyectos.length} proyectos</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus size={14} className="mr-1.5" /> Nuevo proyecto
        </Button>
      </div>

      <KanbanBoard
        columns={columns}
        renderCard={(proyecto) => (
          <ProyectoCard
            proyecto={proyecto}
            responsable={proyecto.responsable_id ? integrantePorId.get(proyecto.responsable_id) : undefined}
            onClick={() => router.push(`/proyectos/${proyecto.id}`)}
          />
        )}
        onDragEnd={handleDragEnd}
      />

      <ProyectoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        clientes={clientes}
        integrantes={integrantes}
        onSubmit={handleCreate}
      />
    </div>
  )
}
