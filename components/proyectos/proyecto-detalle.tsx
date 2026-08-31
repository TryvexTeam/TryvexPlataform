'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Pencil, Trash2, ExternalLink, GitBranch, Clock } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ProyectoForm, type IntegranteElegible } from './proyecto-form'
import { TareasKanban } from '@/components/tareas/tareas-kanban'

import type { Proyecto, ProyectoInsert, Venta } from '@/lib/types/proyecto'
import type { TareaConResponsables } from '@/lib/types/tarea'
import { ESTADOS_PROYECTO } from '@/lib/types/proyecto'
import { cn } from '@/lib/utils'

const estadoPagoColor: Record<string, string> = {
  pendiente: 'bg-yellow-500/10 text-yellow-400',
  pagado: 'bg-green-500/10 text-green-400',
  atrasado: 'bg-red-500/10 text-red-400',
  cancelado: 'bg-white/5 text-[var(--tx-ink-muted)]',
}

const prioridadColor: Record<string, string> = {
  alta: 'text-red-500', media: 'text-yellow-500', baja: 'text-green-500',
}

interface ProyectoDetalleProps {
  proyecto: Proyecto
  tareas: TareaConResponsables[]
  ventas: Venta[]
  /** Los necesita el tablero: son los mismos que usa /tareas. */
  currentUserId: string
  currentIntegranteId: string | null
  integrantes?: IntegranteElegible[]
  /** Quiénes trabajan ya en este proyecto. */
  equipo?: string[]
}

export function ProyectoDetalle({
  proyecto,
  tareas,
  ventas,
  currentUserId,
  currentIntegranteId,
  integrantes = [],
  equipo = [],
}: ProyectoDetalleProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const estadoConf = ESTADOS_PROYECTO.find((e) => e.id === proyecto.estado)

  async function handleEdit(data: ProyectoInsert, integrantesIds: string[]) {
    const res = await fetch(`/api/proyectos/${proyecto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, integrantes_ids: integrantesIds }),
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
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] mb-6">
        <ArrowLeft size={14} /> Volver
      </button>

      {/* `flex-wrap` + `min-w-0`: mismo patrón que lead-detalle.tsx,
          cliente-detalle.tsx y tarea-detalle.tsx -- las 4 fichas hermanas
          tenían el mismo header sin apilar en el teléfono. Acá además el
          subtítulo (estado + tipo + cliente) es la línea más larga de las
          cuatro, así que también necesita poder partirse en dos líneas. */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--tx-ink-primary)] break-words">{proyecto.nombre}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: estadoConf?.color }} />
              {estadoConf?.label}
            </span>
            <span className="text-xs text-[var(--tx-ink-muted)] capitalize">{proyecto.tipo}</span>
            {proyecto.cliente && (
              <span className="text-xs text-[var(--tx-ink-muted)]">
                · {proyecto.cliente.nombre_contacto ?? proyecto.cliente.nombre_negocio}
                {proyecto.cliente.nombre_contacto && proyecto.cliente.nombre_negocio ? ` (${proyecto.cliente.nombre_negocio})` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} className="mr-1.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600" aria-label="Eliminar proyecto">
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
          <div key={item.label} className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-xs text-[var(--tx-ink-muted)] mb-1">{item.label}</p>
            <p className="text-sm font-semibold text-[var(--tx-ink-primary)]">{item.value}</p>
          </div>
        ))}
      </div>

      {progreso !== null && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[var(--tx-ink-muted)] mb-1">
            <span>Progreso de horas</span>
            <span>{progreso}%</span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
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

      <div className="flex gap-4 text-sm text-[var(--tx-ink-muted)] mb-6">
        {proyecto.fecha_inicio && <span>Inicio: {format(new Date(proyecto.fecha_inicio), 'd MMM yyyy', { locale: es })}</span>}
        {proyecto.fecha_entrega && <span>Entrega: {format(new Date(proyecto.fecha_entrega), 'd MMM yyyy', { locale: es })}</span>}
      </div>

      <Separator className="mb-6" />

      {/* Pipeline del proyecto: el mismo tablero scrum que /tareas, filtrado
          por este proyecto. Antes era una lista plana donde no se podía mover
          nada — para cambiar el estado había que abrir cada tarea. */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-[19px] font-medium tracking-[-0.02em] text-[var(--tx-ink-primary)]">
            Tablero
          </h2>
          <span className="inline-flex h-[26px] items-center rounded-full border border-white/[0.10] px-2.5 text-[11.5px] font-medium text-[var(--tx-ink-secondary)]">
            {tareas.filter((t) => !t.eliminado_at).length}
          </span>
        </div>
        <TareasKanban
          initialTareas={tareas}
          currentUserId={currentUserId}
          currentIntegranteId={currentIntegranteId}
          proyectoId={proyecto.id}
          compacto
        />
      </div>

      <ProyectoForm
        open={editOpen}
        onOpenChange={setEditOpen}
        proyecto={proyecto}
        clientes={proyecto.cliente ? [{ id: proyecto.cliente_id!, nombre_negocio: proyecto.cliente.nombre_negocio, nombre_contacto: proyecto.cliente.nombre_contacto } as never] : []}
        integrantes={integrantes}
        equipoInicial={equipo}
        onSubmit={handleEdit}
      />
    </div>
  )
}
