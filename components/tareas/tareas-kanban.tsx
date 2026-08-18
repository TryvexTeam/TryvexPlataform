'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Filter, RotateCcw, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { TareaCard } from './tarea-card'
import { TareaForm } from './tarea-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'
import type { TareaConResponsables, TareaInsert } from '@/lib/types/tarea'

const COLUMNS = [
  { id: 'sin_empezar', title: 'Sin empezar', color: '#94a3b8' },
  { id: 'en_curso', title: 'En curso', color: '#f59e0b' },
  { id: 'listo', title: 'Listo', color: '#22c55e' },
]

const PAPELERA_ID = 'papelera'
type EstadoTarea = 'sin_empezar' | 'en_curso' | 'listo'

interface TareasKanbanProps {
  initialTareas: TareaConResponsables[]
  currentUserId: string
  currentIntegranteId: string | null
}

export function TareasKanban({ initialTareas, currentUserId, currentIntegranteId }: TareasKanbanProps) {
  const router = useRouter()
  const [tareas, setTareas] = useState<TareaConResponsables[]>(initialTareas)
  const [formOpen, setFormOpen] = useState(false)
  const [soloMias, setSoloMias] = useState(false)
  const [colActiva, setColActiva] = useState('sin_empezar')
  const [papeleraOpen, setPapeleraOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Realtime + red de seguridad al volver a la pestaña. Antes solo escuchaba
  // `tareas`, que no estaba publicada: el canal decía SUBSCRIBED y no llegaba nada.
  useDatosVivos(['tareas', 'tarea_responsables'])

  // Sync cuando el server revalida
  useEffect(() => {
    setTareas(initialTareas)
  }, [initialTareas])

  // En el celular el tablero es swipe horizontal (una columna a la vez, con
  // snap). Las pestañas de abajo son un atajo directo, y se resaltan solas
  // siguiendo cual columna esta realmente visible al deslizar.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const masVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (masVisible) {
          setColActiva((masVisible.target as HTMLElement).dataset.kanbanCol ?? 'sin_empezar')
        }
      },
      { root: container, threshold: [0.5, 0.75] }
    )

    container.querySelectorAll('[data-kanban-col]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [tareas.length])

  function irAColumna(id: string) {
    setColActiva(id)
    scrollRef.current
      ?.querySelector(`[data-kanban-col="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  const tareasVisibles = tareas.filter((t) => !t.eliminado_at)
  const enPapelera = tareas.filter((t) => t.eliminado_at)

  const tareasFiltradas = soloMias && currentIntegranteId
    ? tareasVisibles.filter((t) => t.responsables.some((r) => r.integrante_id === currentIntegranteId))
    : tareasVisibles

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: tareasFiltradas.filter((t) => t.estado === col.id),
  }))

  // Soltar una tarjeta sobre el icono de papelera no borra nada: solo marca
  // eliminado_at (ver migracion 050) y la saca del tablero. Restaurar y
  // borrar definitivo viven en el panel de la papelera, no en el drag.
  async function handleDragEnd(itemId: string, _fromCol: string, toCol: string) {
    if (toCol !== PAPELERA_ID) {
      const estado = toCol as EstadoTarea
      setTareas((prev) => prev.map((t) => (t.id === itemId ? { ...t, estado } : t)))
      const res = await fetch(`/api/tareas/${itemId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!res.ok) {
        toast.error('Error al mover la tarea')
        setTareas(initialTareas)
      }
      return
    }

    setTareas((prev) =>
      prev.map((t) => (t.id === itemId ? { ...t, eliminado_at: new Date().toISOString() } : t))
    )
    const res = await fetch(`/api/tareas/${itemId}/papelera`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'mover' }),
    })
    if (!res.ok) {
      toast.error('Error al mover la tarea a la papelera')
      setTareas(initialTareas)
      return
    }
    toast.success('Tarea movida a la papelera')
  }

  async function handleRestaurar(id: string, estado?: EstadoTarea) {
    setTareas((prev) =>
      prev.map((t) => (t.id === id ? { ...t, eliminado_at: null, ...(estado ? { estado } : {}) } : t))
    )
    const res = await fetch(`/api/tareas/${id}/papelera`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'restaurar', estado }),
    })
    if (!res.ok) {
      toast.error('Error al restaurar la tarea')
      setTareas(initialTareas)
      return
    }
    toast.success('Tarea restaurada')
  }

  async function handleEliminarDefinitivo(id: string) {
    if (!confirm('¿Eliminar esta tarea para siempre? No se puede deshacer.')) return
    setTareas((prev) => prev.filter((t) => t.id !== id))
    const res = await fetch(`/api/tareas/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Error al eliminar la tarea')
      setTareas(initialTareas)
      return
    }
    toast.success('Tarea eliminada para siempre')
  }

  async function handleCreate(data: TareaInsert) {
    const res = await fetch('/api/tareas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) throw new Error('Error al crear tarea')
    toast.success('Tarea creada')
    router.refresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--tx-ink-primary)]">Tareas</h1>
          <p className="text-sm text-[var(--tx-ink-muted)] mt-0.5">
            {tareasVisibles.length} tareas en total
            {enPapelera.length > 0 && ` · ${enPapelera.length} en la papelera`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={soloMias ? 'default' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setSoloMias(!soloMias)}
          >
            <Filter size={14} className="mr-1.5" />
            Mis tareas
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setFormOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            Nueva tarea
          </Button>
        </div>
      </div>

      {/* Pestañas de columna — solo celular. En desktop el tablero completo ya
          se ve de un vistazo, aca en cambio es una tira que hay que deslizar. */}
      <div className="flex md:hidden gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {columns.map((col) => (
          <button
            key={col.id}
            onClick={() => irAColumna(col.id)}
            className={cn(
              'flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              colActiva === col.id
                ? 'bg-[var(--tx-accent)] text-white'
                : 'bg-[var(--tx-surface-2)] text-[var(--tx-ink-muted)]'
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: col.color }} />
            {col.title}
            <span className="tabular-nums opacity-80">{col.items.length}</span>
          </button>
        ))}
      </div>

      <KanbanBoard
        columns={columns}
        scrollContainerRef={(el) => (scrollRef.current = el)}
        renderCard={(tarea) => (
          <TareaCard
            tarea={tarea}
            onClick={() => router.push(`/tareas/${tarea.id}`)}
          />
        )}
        onDragEnd={handleDragEnd}
        trashZone={{ id: PAPELERA_ID, count: enPapelera.length, onOpen: () => setPapeleraOpen(true) }}
      />

      <TareaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
      />

      {/* Panel de la papelera: se abre con el icono flotante, no vive en el
          tablero. Arrastrar tareas ahi es rapido; verlas y recuperarlas es
          una lista aparte, para que el kanban nunca acumule una fila mas. */}
      <Dialog open={papeleraOpen} onOpenChange={setPapeleraOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={16} />
              Papelera
            </DialogTitle>
          </DialogHeader>

          {enPapelera.length === 0 ? (
            <p className="text-sm text-[var(--tx-ink-muted)] text-center py-8">
              La papelera está vacía
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {enPapelera.map((tarea) => (
                <div key={tarea.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <TareaCard
                      tarea={tarea}
                      enPapelera
                      onClick={() => {
                        setPapeleraOpen(false)
                        router.push(`/tareas/${tarea.id}`)
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      title="Restaurar"
                      onClick={() => handleRestaurar(tarea.id)}
                    >
                      <RotateCcw size={13} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-red-600 hover:text-red-700"
                      title="Eliminar para siempre"
                      onClick={() => handleEliminarDefinitivo(tarea.id)}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
