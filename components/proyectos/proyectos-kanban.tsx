'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from '@/lib/toast'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { Button } from '@/components/ui/button'
import { ProyectoForm } from './proyecto-form'
import type { Proyecto, ProyectoInsert } from '@/lib/types/proyecto'
import type { Cliente } from '@/lib/types/cliente'
import { ESTADOS_PROYECTO } from '@/lib/types/proyecto'
import { cn } from '@/lib/utils'

interface ProyectosKanbanProps {
  initialProyectos: Proyecto[]
  clientes: Cliente[]
}

function ProyectoCard({ proyecto, onClick }: { proyecto: Proyecto; onClick?: () => void }) {
  const estadoConf = ESTADOS_PROYECTO.find((e) => e.id === proyecto.estado)
  const progreso = proyecto.horas_estimadas && proyecto.horas_reales
    ? Math.min(100, Math.round((proyecto.horas_reales / proyecto.horas_estimadas) * 100))
    : null

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-neutral-200 p-3 cursor-pointer hover:border-neutral-300 hover:shadow-sm transition-all select-none"
    >
      <p className="text-sm font-semibold text-neutral-800 mb-1 line-clamp-2">{proyecto.nombre}</p>
      {proyecto.cliente && (
        <p className="text-xs text-neutral-400 mb-2 truncate">{proyecto.cliente.nombre_contacto ?? proyecto.cliente.nombre_negocio}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500 capitalize">{proyecto.tipo}</span>
        {proyecto.costo_total_usd && (
          <span className="text-xs font-medium text-neutral-600">${proyecto.costo_total_usd.toLocaleString()}</span>
        )}
      </div>
      {progreso !== null && (
        <div className="mt-2">
          <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">{proyecto.horas_reales}h / {proyecto.horas_estimadas}h</p>
        </div>
      )}
    </div>
  )
}

export function ProyectosKanban({ initialProyectos, clientes }: ProyectosKanbanProps) {
  const router = useRouter()
  const [proyectos, setProyectos] = useState<Proyecto[]>(initialProyectos)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => { setProyectos(initialProyectos) }, [initialProyectos])

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

  async function handleCreate(data: ProyectoInsert) {
    const res = await fetch('/api/proyectos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
          <ProyectoCard proyecto={proyecto} onClick={() => router.push(`/proyectos/${proyecto.id}`)} />
        )}
        onDragEnd={handleDragEnd}
      />

      <ProyectoForm open={formOpen} onOpenChange={setFormOpen} clientes={clientes} onSubmit={handleCreate} />
    </div>
  )
}
