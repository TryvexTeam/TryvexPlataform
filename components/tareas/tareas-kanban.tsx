'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Filter, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { TareaCard } from './tarea-card'
import { TareaForm } from './tarea-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'
import {
  ESTADOS_TAREA,
  etiquetaEstado,
  type EstadoTarea,
  type TareaConResponsables,
  type TareaInsert,
} from '@/lib/types/tarea'

/**
 * Color de cada columna del tablero.
 *
 * Va de frío a cálido y termina en verde, siguiendo el avance del trabajo: lo
 * que no ha empezado es apagado, lo que está en marcha llama la atención y lo
 * aceptado se apaga otra vez, pero en verde. Los ids y las etiquetas salen de
 * `ESTADOS_TAREA` para que el tablero, el formulario y el detalle no puedan
 * discrepar.
 */
const COLOR_COLUMNA: Record<EstadoTarea, string> = {
  backlog: '#64748b',
  sin_empezar: '#94a3b8',
  en_curso: '#f59e0b',
  en_revision: '#a78bfa',
  listo: '#22c55e',
}

const COLUMNS = ESTADOS_TAREA.map((e) => ({
  id: e.id,
  title: e.label,
  color: COLOR_COLUMNA[e.id],
}))

const PAPELERA_ID = 'papelera'

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
  const [papeleraOpen, setPapeleraOpen] = useState(false)
  const [papeleraDropCount, setPapeleraDropCount] = useState(0)

  // Realtime + red de seguridad al volver a la pestaña. Antes solo escuchaba
  // `tareas`, que no estaba publicada: el canal decía SUBSCRIBED y no llegaba nada.
  useDatosVivos(['tareas', 'tarea_responsables'])

  // Sync cuando el server revalida
  useEffect(() => {
    setTareas(initialTareas)
  }, [initialTareas])

  const tareasVisibles = tareas.filter((t) => !t.eliminado_at)
  const enPapelera = tareas.filter((t) => t.eliminado_at)

  const tareasFiltradas = soloMias && currentIntegranteId
    ? tareasVisibles.filter((t) => t.responsables.some((r) => r.integrante_id === currentIntegranteId))
    : tareasVisibles

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: tareasFiltradas.filter((t) => t.estado === col.id),
  }))

  async function cambiarEstado(itemId: string, estado: EstadoTarea) {
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
  }

  // No borra nada: solo marca eliminado_at (ver migracion 050) y la saca del
  // tablero. Restaurar y borrar definitivo viven en el panel de la papelera.
  async function moverAPapelera(itemId: string) {
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
    setPapeleraDropCount((n) => n + 1)
    toast.success('Tarea movida a la papelera')
  }

  // El tablero de escritorio suelta sobre columnas o sobre el icono flotante
  // de papelera; ambos casos delegan en las mismas funciones que usa el
  // swipe del celular.
  function handleDragEnd(itemId: string, _fromCol: string, toCol: string) {
    if (toCol === PAPELERA_ID) {
      moverAPapelera(itemId)
    } else {
      cambiarEstado(itemId, toCol as EstadoTarea)
    }
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

      {/* Mismo tablero, misma logica de drag&drop en los dos casos — dnd-kit
          detecta por posicion real, no por como esta armado el layout.
          Desktop: columnas lado a lado con scroll lateral. Celular: las
          mismas columnas apiladas a lo ancho, para que agarrar una tarjeta y
          arrastrarla a otra seccion (o al tacho) no compita con el scroll
          ni tape nada. */}
      <div className="hidden md:block">
        <KanbanBoard
          columns={columns}
          orientation="horizontal"
          renderCard={(tarea) => (
            <TareaCard
              tarea={tarea}
              onClick={() => router.push(`/tareas/${tarea.id}`)}
            />
          )}
          onDragEnd={handleDragEnd}
          trashZone={{
            id: PAPELERA_ID,
            count: enPapelera.length,
            dropCount: papeleraDropCount,
            onOpen: () => setPapeleraOpen(true),
          }}
        />
      </div>

      <div className="md:hidden">
        <KanbanBoard
          columns={columns}
          orientation="vertical"
          renderCard={(tarea) => (
            <TareaCard
              tarea={tarea}
              onClick={() => router.push(`/tareas/${tarea.id}`)}
            />
          )}
          onDragEnd={handleDragEnd}
          trashZone={{
            id: PAPELERA_ID,
            count: enPapelera.length,
            dropCount: papeleraDropCount,
            onOpen: () => setPapeleraOpen(true),
          }}
        />
      </div>

      <TareaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
      />

      {/* Panel de la papelera: se abre con el icono flotante, no vive en el
          tablero. Arrastrar tareas ahi es rapido; verlas y recuperarlas es
          una lista aparte, para que el kanban nunca acumule una fila mas. */}
      <Dialog open={papeleraOpen} onOpenChange={setPapeleraOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md max-h-[80vh] overflow-y-auto overflow-x-hidden p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={16} />
              Papelera
              <span className="text-xs font-normal text-[var(--tx-ink-muted)]">({enPapelera.length})</span>
            </DialogTitle>
          </DialogHeader>

          {enPapelera.length === 0 ? (
            <p className="text-sm text-[var(--tx-ink-muted)] text-center py-8">
              La papelera está vacía
            </p>
          ) : (
            // min-w-0: el dialog es un grid (ver dialog.tsx) y sin esto el
            // navegador dejaba crecer esta columna al ancho de su contenido
            // en vez de recortarla — los botones de cada fila quedaban
            // empujados fuera de la vista, sobre todo en celular.
            <div className="flex flex-col min-w-0 divide-y divide-[var(--tx-border)]">
              {enPapelera.map((tarea) => (
                <div
                  key={tarea.id}
                  className="flex items-center gap-2 min-w-0 py-2.5 hover:bg-[var(--tx-surface-2)] transition-colors"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: COLUMNS.find((c) => c.id === tarea.estado)?.color ?? '#71717a' }}
                  />
                  <button
                    onClick={() => {
                      setPapeleraOpen(false)
                      router.push(`/tareas/${tarea.id}`)
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium truncate text-[var(--tx-ink-primary)]">
                      {tarea.titulo}
                    </p>
                    <p className="text-xs text-[var(--tx-ink-muted)] truncate">
                      {etiquetaEstado(tarea.estado)}
                      {tarea.eliminado_at &&
                        ` · hace ${formatDistanceToNow(new Date(tarea.eliminado_at), { locale: es })}`}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Restaurar"
                      onClick={() => handleRestaurar(tarea.id)}
                    >
                      <RotateCcw size={13} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-red-600 hover:text-red-700"
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
