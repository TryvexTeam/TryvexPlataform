'use client'

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KanbanColumn<T> {
  id: string
  title: string
  items: T[]
  color?: string
}

interface KanbanBoardProps<T extends { id: string }> {
  columns: KanbanColumn<T>[]
  renderCard: (item: T, isDragging?: boolean) => React.ReactNode
  onDragEnd: (itemId: string, fromColumn: string, toColumn: string) => void
  /** Da acceso al div con scroll horizontal, para que quien use el tablero
   *  pueda sincronizar controles propios (p.ej. pestañas moviles) con el scroll. */
  scrollContainerRef?: (el: HTMLDivElement | null) => void
  /** Icono de papelera flotante, NO una columna mas: soltar una tarjeta ahi la
   *  manda a la papelera sin que el tablero acumule una fila que solo crece. */
  trashZone?: { id: string; count: number; onOpen: () => void }
}

/** Zona de drop del icono de papelera. Aparte del resto de columnas para que
 *  nunca se vea como "una fila mas": es un blanco fijo, chico, con su propio
 *  feedback (crece y cambia de color al pasarle una tarjeta por encima). */
function TrashDropZone({ id, count, onOpen }: { id: string; count: number; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <motion.button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      animate={isOver ? { scale: 1.15 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="fixed bottom-24 right-5 md:bottom-8 md:right-8 z-40 flex items-center justify-center h-12 w-12 rounded-full shadow-lg"
      style={{
        background: isOver ? 'oklch(63% 0.21 22 / 90%)' : 'var(--tx-surface-2)',
        border: isOver ? '1.5px solid oklch(63% 0.21 22)' : '1px solid var(--tx-border)',
      }}
      aria-label="Papelera de tareas"
    >
      <Trash2 size={18} color={isOver ? 'white' : 'var(--tx-ink-secondary)'} />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
          style={{ background: 'var(--tx-accent)', color: 'white' }}
        >
          {count}
        </span>
      )}
    </motion.button>
  )
}

const cardEntrance = {
  hidden: { opacity: 0, y: -6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 },
  },
}

function SortableCard<T extends { id: string }>({
  item,
  renderCard,
}: {
  item: T
  renderCard: (item: T, isDragging?: boolean) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      variants={cardEntrance}
      layout
      {...attributes}
      {...listeners}
      animate={isDragging ? { opacity: 0, scale: 0.98 } : { opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="touch-none"
    >
      {renderCard(item, isDragging)}
    </motion.div>
  )
}

function DroppableColumn<T extends { id: string }>({
  col,
  renderCard,
}: {
  col: KanbanColumn<T>
  renderCard: (item: T, isDragging?: boolean) => React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  return (
    <SortableContext
      id={col.id}
      items={col.items.map((i) => i.id)}
      strategy={verticalListSortingStrategy}
    >
      <motion.div
        ref={setNodeRef}
        animate={isOver ? { scale: 1.005 } : { scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="flex flex-col gap-2 min-h-[120px] rounded-xl p-2 transition-all duration-150"
        style={{
          background: isOver ? 'oklch(58% 0.24 292 / 8%)' : 'oklch(8% 0.003 240)',
          border: isOver ? '1.5px dashed oklch(58% 0.24 292 / 40%)' : '1px solid var(--tx-border)',
        }}
      >
        <motion.div
          variants={{ show: { transition: { staggerChildren: 0.03 } } }}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-2"
        >
          {col.items.map((item) => (
            <SortableCard key={item.id} item={item} renderCard={renderCard} />
          ))}
        </motion.div>

        <AnimatePresence>
          {col.items.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-[var(--tx-ink-muted)] text-center py-6"
            >
              {isOver ? '↓ Soltar aquí' : 'Sin elementos'}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </SortableContext>
  )
}

export function KanbanBoard<T extends { id: string }>({
  columns,
  renderCard,
  onDragEnd,
  scrollContainerRef,
  trashZone,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null)

  // Sensores separados a proposito: con un solo PointerSensor, en el celular
  // cualquier intento de hacer scroll horizontal por las columnas arrancaba un
  // drag a los 8px (el umbral de mouse) y la tarjeta "se pegaba" al dedo en vez
  // de dejar scrollear — la vista de tareas quedaba inutilizable al tacto.
  // TouchSensor con delay distingue un swipe (scroll) de un toque sostenido
  // (drag): hay que mantener 200ms sin moverse mas de 8px para que arranque.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  function findColumn(itemId: string) {
    return columns.find((col) => col.items.some((i) => i.id === itemId))
  }

  function findItem(itemId: string) {
    for (const col of columns) {
      const item = col.items.find((i) => i.id === itemId)
      if (item) return item
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const fromCol = findColumn(active.id as string)
    if (!fromCol) return

    // La papelera no es una columna: no tiene items propios, asi que no
    // aparece en `columns` y hay que reconocerla aparte por su id.
    if (trashZone && over.id === trashZone.id) {
      onDragEnd(active.id as string, fromCol.id, trashZone.id)
      return
    }

    const toCol = columns.find((c) => c.id === over.id) ?? findColumn(over.id as string)
    if (!toCol) return
    if (fromCol.id === toCol.id && active.id === over.id) return

    onDragEnd(active.id as string, fromCol.id, toCol.id)
  }

  const activeItem = activeId ? findItem(activeId) : null

  return (
    <DndContext id="kanban-dnd" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none"
        style={{ scrollPaddingLeft: '1rem' }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            data-kanban-col={col.id}
            className="flex flex-col w-[85vw] max-w-[272px] md:w-[272px] shrink-0 snap-start"
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-2">
                {col.color && (
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: col.color }}
                  />
                )}
                <span className="text-[13px] font-semibold text-[var(--tx-ink-primary)] tracking-tight">
                  {col.title}
                </span>
              </div>
              <span className="text-[11px] font-medium text-[var(--tx-ink-muted)] bg-[var(--tx-surface-2)] rounded-full px-2 py-0.5 tabular-nums">
                {col.items.length}
              </span>
            </div>

            <DroppableColumn col={col} renderCard={renderCard} />
          </div>
        ))}
      </div>

      {trashZone && <TrashDropZone id={trashZone.id} count={trashZone.count} onOpen={trashZone.onOpen} />}

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <motion.div
            initial={{ scale: 1, rotate: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
            animate={{
              scale: 1.03,
              rotate: 1,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {renderCard(activeItem, true)}
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
