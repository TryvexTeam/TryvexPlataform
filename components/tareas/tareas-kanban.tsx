'use client'

import { useState } from 'react'
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
import { ConfirmarDialog } from '@/components/clientes/confirmar-dialog'
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
  /**
   * Ámbito del tablero. Con `proyectoId`, las tareas que se creen desde aquí
   * nacen dentro de ese proyecto — es el mismo tablero, no una copia: la
   * papelera, el detalle, la asignación y el arrastre se comportan igual en
   * los dos sitios porque literalmente son el mismo componente.
   */
  proyectoId?: string
  /** Oculta el título y el contador: dentro de un proyecto ya hay cabecera. */
  compacto?: boolean
}

export function TareasKanban({
  initialTareas,
  currentUserId,
  currentIntegranteId,
  proyectoId,
  compacto = false,
}: TareasKanbanProps) {
  const router = useRouter()
  const [tareas, setTareas] = useState<TareaConResponsables[]>(initialTareas)
  const [formOpen, setFormOpen] = useState(false)
  const [soloMias, setSoloMias] = useState(false)
  const [papeleraOpen, setPapeleraOpen] = useState(false)
  const [papeleraDropCount, setPapeleraDropCount] = useState(0)
  const [eliminarDefinitivoId, setEliminarDefinitivoId] = useState<string | null>(null)

  // Realtime + red de seguridad al volver a la pestaña. Antes solo escuchaba
  // `tareas`, que no estaba publicada: el canal decía SUBSCRIBED y no llegaba nada.
  useDatosVivos(['tareas', 'tarea_responsables'])

  // Ajuste de estado durante el render en vez de un effect: evita el setState
  // sincrono dentro de un effect (mismo patron que leads-pipeline.tsx). Sync
  // cuando el server revalida.
  const [initialTareasPrevias, setInitialTareasPrevias] = useState(initialTareas)
  if (initialTareas !== initialTareasPrevias) {
    setInitialTareasPrevias(initialTareas)
    setTareas(initialTareas)
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

  async function cambiarEstado(itemId: string, estado: EstadoTarea) {
    // Se guarda el estado previo de ESTA tarjeta nada más: revertir a
    // `initialTareas` entero pisaba cambios de OTRAS tarjetas ya confirmados
    // en el servidor mientras esta petición estaba en vuelo.
    //
    // El revert solo pisa si la tarjeta SIGUE mostrando el valor optimista que
    // puso ESTA llamada (`t.estado === estado`): dos drags rápidos sobre la
    // misma tarjeta (ej. A→B, después B→C con la respuesta de A→B llegando
    // tarde y fallando) no deben hacer que el fallo del primero borre el
    // resultado ya confirmado del segundo.
    const anterior = tareas.find((t) => t.id === itemId)
    setTareas((prev) => prev.map((t) => (t.id === itemId ? { ...t, estado } : t)))
    const res = await fetch(`/api/tareas/${itemId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) {
      toast.error('Error al mover la tarea')
      if (anterior) {
        setTareas((prev) =>
          prev.map((t) => (t.id === itemId && t.estado === estado ? anterior : t))
        )
      }
    }
  }

  // No borra nada: solo marca eliminado_at (ver migracion 050) y la saca del
  // tablero. Restaurar y borrar definitivo viven en el panel de la papelera.
  async function moverAPapelera(itemId: string) {
    const anterior = tareas.find((t) => t.id === itemId)
    const marcaOptimista = new Date().toISOString()
    setTareas((prev) =>
      prev.map((t) => (t.id === itemId ? { ...t, eliminado_at: marcaOptimista } : t))
    )
    const res = await fetch(`/api/tareas/${itemId}/papelera`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'mover' }),
    })
    if (!res.ok) {
      toast.error('Error al mover la tarea a la papelera')
      if (anterior) {
        setTareas((prev) =>
          prev.map((t) => (t.id === itemId && t.eliminado_at === marcaOptimista ? anterior : t))
        )
      }
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
    const anterior = tareas.find((t) => t.id === id)
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
      // Solo revierte si sigue "restaurada" (eliminado_at null): si mientras
      // tanto otra acción ya la movió de nuevo a la papelera, esa es la que manda.
      if (anterior) {
        setTareas((prev) =>
          prev.map((t) => (t.id === id && t.eliminado_at === null ? anterior : t))
        )
      }
      return
    }
    toast.success('Tarea restaurada')
  }

  async function handleEliminarDefinitivo(id: string) {
    const anterior = tareas.find((t) => t.id === id)
    const indice = tareas.findIndex((t) => t.id === id)
    setTareas((prev) => prev.filter((t) => t.id !== id))
    const res = await fetch(`/api/tareas/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Error al eliminar la tarea')
      // Solo la reinserta si sigue ausente: si mientras tanto otra acción ya
      // la trajo de vuelta (poco probable con el item borrado, pero por las dudas).
      if (anterior) {
        setTareas((prev) => {
          if (prev.some((t) => t.id === id)) return prev
          const copia = [...prev]
          copia.splice(indice, 0, anterior)
          return copia
        })
      }
      return
    }
    toast.success('Tarea eliminada para siempre')
  }

  async function handleCreate(data: TareaInsert) {
    const res = await fetch('/api/tareas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Dentro de un proyecto la tarea nace ya asociada a él, sin que haya
      // que elegirlo: si estás en el tablero del proyecto, es obvio de cuál.
      body: JSON.stringify(proyectoId ? { ...data, proyecto_id: proyectoId } : data),
    })

    if (!res.ok) throw new Error('Error al crear tarea')
    toast.success('Tarea creada')
    router.refresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        {/* Dentro de un proyecto la ficha ya pone su propia cabecera: repetir
            "Tareas" aquí apilaría dos títulos. */}
        {compacto ? (
          <p className="text-sm text-[var(--tx-ink-secondary)]">
            {tareasVisibles.length} {tareasVisibles.length === 1 ? 'tarea' : 'tareas'}
            {enPapelera.length > 0 && ` · ${enPapelera.length} en la papelera`}
          </p>
        ) : (
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[var(--tx-ink-primary)]">Tareas</h1>
            <p className="text-sm text-[var(--tx-ink-muted)] mt-0.5">
              {tareasVisibles.length} tareas en total
              {enPapelera.length > 0 && ` · ${enPapelera.length} en la papelera`}
            </p>
          </div>
        )}
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

      {/* Un solo tablero para los dos tamaños: apilado en el teléfono —para
          que arrastrar una tarjeta a otra sección o al tacho no compita con el
          scroll— y en columnas desde `md`. Antes eran dos KanbanBoard con uno
          escondido por CSS; con dos instancias, dnd-kit monta y descarta sus
          sensores al cruzar el breakpoint y el DOM lleva el doble de nodos
          para el mismo tablero. */}
      <KanbanBoard
        columns={columns}
        renderCard={(tarea) => (
          <TareaCard tarea={tarea} onClick={() => router.push(`/tareas/${tarea.id}`)} />
        )}
        onDragEnd={handleDragEnd}
        trashZone={{
          id: PAPELERA_ID,
          count: enPapelera.length,
          dropCount: papeleraDropCount,
          onOpen: () => setPapeleraOpen(true),
        }}
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
                      onClick={() => setEliminarDefinitivoId(tarea.id)}
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

      <ConfirmarDialog
        open={eliminarDefinitivoId !== null}
        onOpenChange={(o) => !o && setEliminarDefinitivoId(null)}
        titulo="¿Eliminar esta tarea para siempre?"
        descripcion="No se puede deshacer."
        confirmar="Eliminar para siempre"
        destructivo
        onConfirmar={async () => {
          if (eliminarDefinitivoId) await handleEliminarDefinitivo(eliminarDefinitivoId)
        }}
      />
    </div>
  )
}
