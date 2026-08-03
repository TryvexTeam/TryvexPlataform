'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Filter } from 'lucide-react'
import { toast } from '@/lib/toast'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { TareaCard } from './tarea-card'
import { TareaForm } from './tarea-form'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { TareaConResponsables, TareaInsert } from '@/lib/types/tarea'

const COLUMNS = [
  { id: 'sin_empezar', title: 'Sin empezar', color: '#94a3b8' },
  { id: 'en_curso', title: 'En curso', color: '#f59e0b' },
  { id: 'listo', title: 'Listo', color: '#22c55e' },
]

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

  // Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('tareas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => {
        router.refresh()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [router])

  // Sync cuando el server revalida
  useEffect(() => {
    setTareas(initialTareas)
  }, [initialTareas])

  const tareasFiltradas = soloMias && currentIntegranteId
    ? tareas.filter((t) => t.responsables.some((r) => r.integrante_id === currentIntegranteId))
    : tareas

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: tareasFiltradas.filter((t) => t.estado === col.id),
  }))

  async function handleDragEnd(itemId: string, _fromCol: string, toCol: string) {
    const estado = toCol as 'sin_empezar' | 'en_curso' | 'listo'

    // Optimistic update
    setTareas((prev) =>
      prev.map((t) => (t.id === itemId ? { ...t, estado } : t))
    )

    const res = await fetch(`/api/tareas/${itemId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })

    if (!res.ok) {
      toast.error('Error al mover la tarea')
      setTareas(initialTareas)
    }
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Tareas</h1>
          <p className="text-sm text-[var(--tx-ink-muted)] mt-0.5">{tareas.length} tareas en total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={soloMias ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSoloMias(!soloMias)}
          >
            <Filter size={14} className="mr-1.5" />
            Mis tareas
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            Nueva tarea
          </Button>
        </div>
      </div>

      <KanbanBoard
        columns={columns}
        renderCard={(tarea) => (
          <TareaCard
            tarea={tarea}
            onClick={() => router.push(`/tareas/${tarea.id}`)}
          />
        )}
        onDragEnd={handleDragEnd}
      />

      <TareaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
      />
    </div>
  )
}
