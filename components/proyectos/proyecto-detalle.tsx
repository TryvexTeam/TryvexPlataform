'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Pencil, Trash2, ExternalLink, GitBranch, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ProyectoForm } from './proyecto-form'
import type { Proyecto, ProyectoInsert, Venta } from '@/lib/types/proyecto'
import type { TareaConResponsables } from '@/lib/types/tarea'
import { ESTADOS_PROYECTO } from '@/lib/types/proyecto'
import { cn } from '@/lib/utils'

const estadoPagoColor: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  pagado: 'bg-green-100 text-green-700',
  atrasado: 'bg-red-100 text-red-700',
  cancelado: 'bg-neutral-100 text-neutral-500',
}

const prioridadColor: Record<string, string> = {
  alta: 'text-red-500', media: 'text-yellow-500', baja: 'text-green-500',
}

interface ProyectoDetalleProps {
  proyecto: Proyecto
  tareas: TareaConResponsables[]
  ventas: Venta[]
}

export function ProyectoDetalle({ proyecto, tareas, ventas }: ProyectoDetalleProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const estadoConf = ESTADOS_PROYECTO.find((e) => e.id === proyecto.estado)

  async function handleEdit(data: ProyectoInsert) {
    const res = await fetch(`/api/proyectos/${proyecto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Proyecto actualizado')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este proyecto?')) return
    await fetch(`/api/proyectos/${proyecto.id}`, { method: 'DELETE' })
    toast.success('Proyecto eliminado')
    router.push('/proyectos')
  }

  const progreso = proyecto.horas_estimadas && proyecto.horas_reales
    ? Math.min(100, Math.round((proyecto.horas_reales / proyecto.horas_estimadas) * 100))
    : null

  const tareasCompletadas = tareas.filter((t) => t.estado === 'listo').length

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 mb-6">
        <ArrowLeft size={14} /> Volver
      </button>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--tx-ink-primary)]">{proyecto.nombre}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: estadoConf?.color }} />
              {estadoConf?.label}
            </span>
            <span className="text-xs text-neutral-400 capitalize">{proyecto.tipo}</span>
            {proyecto.cliente && (
              <span className="text-xs text-neutral-400">· {proyecto.cliente.nombre_negocio}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} className="mr-1.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600">
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Costo total', value: proyecto.costo_total_usd ? `$${proyecto.costo_total_usd.toLocaleString()}` : '—' },
          { label: 'Horas estimadas', value: proyecto.horas_estimadas ? `${proyecto.horas_estimadas}h` : '—' },
          { label: 'Horas reales', value: proyecto.horas_reales ? `${proyecto.horas_reales}h` : '—' },
          { label: 'Tareas', value: `${tareasCompletadas}/${tareas.length}` },
        ].map((item) => (
          <div key={item.label} className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500 mb-1">{item.label}</p>
            <p className="text-sm font-semibold text-neutral-800">{item.value}</p>
          </div>
        ))}
      </div>

      {progreso !== null && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-neutral-500 mb-1">
            <span>Progreso de horas</span>
            <span>{progreso}%</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full', progreso > 100 ? 'bg-red-400' : 'bg-blue-400')}
              style={{ width: `${Math.min(progreso, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-6">
        {proyecto.url_deploy && (
          <a href={proyecto.url_deploy} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><ExternalLink size={13} className="mr-1.5" /> Ver deploy</Button>
          </a>
        )}
        {proyecto.repo_url && (
          <a href={proyecto.repo_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><GitBranch size={13} className="mr-1.5" /> Repositorio</Button>
          </a>
        )}
      </div>

      <div className="flex gap-4 text-sm text-neutral-500 mb-6">
        {proyecto.fecha_inicio && <span>Inicio: {format(new Date(proyecto.fecha_inicio), 'd MMM yyyy', { locale: es })}</span>}
        {proyecto.fecha_entrega && <span>Entrega: {format(new Date(proyecto.fecha_entrega), 'd MMM yyyy', { locale: es })}</span>}
      </div>

      <Separator className="mb-6" />

      {/* Tareas */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Tareas ({tareas.length})</h2>
        {tareas.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-4">Sin tareas asociadas</p>
        ) : (
          <div className="space-y-2">
            {tareas.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(`/tareas/${t.id}`)}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-bold', prioridadColor[t.prioridad])}>●</span>
                  <p className="text-sm text-neutral-800">{t.titulo}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full',
                  t.estado === 'listo' ? 'bg-green-100 text-green-700' :
                  t.estado === 'en_curso' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-500'
                )}>
                  {t.estado === 'listo' ? 'Listo' : t.estado === 'en_curso' ? 'En curso' : 'Sin empezar'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProyectoForm
        open={editOpen}
        onOpenChange={setEditOpen}
        proyecto={proyecto}
        clientes={proyecto.cliente ? [{ id: proyecto.cliente_id!, nombre_negocio: proyecto.cliente.nombre_negocio } as never] : []}
        onSubmit={handleEdit}
      />
    </div>
  )
}
