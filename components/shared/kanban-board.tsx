'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
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
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {renderCard(item, isDragging)}
    </div>
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
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col gap-2 min-h-[120px] rounded-lg p-2 transition-colors',
          isOver ? 'bg-neutral-200' : 'bg-neutral-100'
        )}
      >
        {col.items.map((item) => (
          <SortableCard key={item.id} item={item} renderCard={renderCard} />
        ))}
        {col.items.length === 0 && (
          <p className="text-xs text-neutral-400 text-center py-6">
            {isOver ? 'Soltar aquí' : 'Sin tareas'}
          </p>
        )}
      </div>
    </SortableContext>
  )
}

export function KanbanBoard<T extends { id: string }>({
  columns,
  renderCard,
  onDragEnd,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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
    // over.id puede ser el id de una columna (droppable) o de un ítem (sortable)
    const toCol =
      columns.find((c) => c.id === over.id) ?? findColumn(over.id as string)

    if (!fromCol || !toCol) return
    if (fromCol.id === toCol.id && active.id === over.id) return

    onDragEnd(active.id as string, fromCol.id, toCol.id)
  }

  const activeItem = activeId ? findItem(activeId) : null

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col min-w-[280px] w-[280px] shrink-0">
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                {col.color && (
                  <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                )}
                <span className="text-sm font-semibold text-neutral-700">{col.title}</span>
              </div>
              <span className="text-xs text-neutral-400 bg-neutral-100 rounded-full px-2 py-0.5">
                {col.items.length}
              </span>
            </div>

            <DroppableColumn col={col} renderCard={renderCard} />
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeItem ? renderCard(activeItem, true) : null}
      </DragOverlay>
    </DndContext>
  )
}
