'use client'

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
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
   *  manda a la papelera sin que el tablero acumule una fila que solo crece.
   *  `dropCount` sube cada vez que algo cae ahi de verdad, para disparar el
   *  "gulp" de la tapa aunque el soltar sea mas rapido que el hover. */
  trashZone?: { id: string; count: number; dropCount: number; onOpen: () => void }
  /** 'horizontal' (por defecto): columnas lado a lado con scroll lateral,
   *  como en desktop. 'vertical': mismas columnas apiladas a lo ancho —
   *  para celular, donde el scroll lateral y el drag competian por el mismo
   *  gesto. El drag y el drop funcionan igual en los dos casos, dnd-kit
   *  detecta por posicion real, no le importa la direccion del layout. */
  orientation?: 'horizontal' | 'vertical'
}

/** Tacho de basura propio (no un icono de lucide): cuerpo + tapa por separado
 *  para poder animar la tapa como una bisagra real. Se abre mientras una
 *  tarjeta pasa por encima y hace un golpe seco al soltarla. */
function TrashCan({ open, color }: { open: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      {/* Cuerpo */}
      <path
        d="M6 9.5 L7 20.5 Q7.1 22 8.6 22 H15.4 Q16.9 22 17 20.5 L18 9.5 Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <line x1="10" y1="12.5" x2="10.4" y2="18.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="14" y1="12.5" x2="13.6" y2="18.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      {/* Tapa: gira desde la bisagra izquierda (5, 9.5) */}
      <motion.g
        animate={{ rotate: open ? -32 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        style={{ originX: '5px', originY: '9.5px' }}
      >
        <line x1="4.5" y1="9.5" x2="19.5" y2="9.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9.5 9.5 V7 Q9.5 6 10.5 6 H13.5 Q14.5 6 14.5 7 V9.5" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      </motion.g>
    </svg>
  )
}

/** Zona de drop del icono de papelera. Aparte del resto de columnas para que
 *  nunca se vea como "una fila mas": es un blanco fijo, chico, con su propio
 *  feedback (se agranda, la tapa se abre al pasarle una tarjeta por encima y
 *  pega un golpe seco cuando algo cae adentro de verdad). */
function TrashDropZone({
  id,
  count,
  dropCount,
  onOpen,
}: {
  id: string
  count: number
  dropCount: number
  onOpen: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const canControls = useAnimation()
  const [recienCaida, setRecienCaida] = useState(false)
  const prevDropCount = useRef(dropCount)

  // El hover ya escala el icono; esto es aparte, el "gulp" al momento exacto
  // en que algo cae — puede pasar mas rapido de lo que dnd-kit tarda en
  // reportar isOver=false, por eso no alcanza con animar solo el hover.
  useEffect(() => {
    if (dropCount === prevDropCount.current) return
    prevDropCount.current = dropCount
    setRecienCaida(true)
    canControls.start({
      scale: [1, 0.88, 1.12, 1],
      rotate: [0, -6, 5, 0],
      transition: { duration: 0.45, ease: 'easeOut' },
    })
    const t = setTimeout(() => setRecienCaida(false), 280)
    return () => clearTimeout(t)
  }, [dropCount, canControls])

  useEffect(() => {
    canControls.start({ scale: isOver ? 1.15 : 1, transition: { type: 'spring', stiffness: 400, damping: 25 } })
  }, [isOver, canControls])

  return (
    <motion.button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      animate={canControls}
      className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 flex items-center justify-center h-12 w-12 rounded-full shadow-lg"
      style={{
        background: isOver ? 'oklch(63% 0.21 22 / 90%)' : 'var(--tx-surface-2)',
        border: isOver ? '1.5px solid oklch(63% 0.21 22)' : '1px solid var(--tx-border)',
      }}
      aria-label="Papelera de tareas"
    >
      <TrashCan open={isOver || recienCaida} color={isOver ? 'white' : 'var(--tx-ink-secondary)'} />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
          style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
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
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 },
  },
  /** Hueco que deja la tarjeta mientras el DragOverlay la lleva bajo el cursor. */
  arrastrando: { opacity: 0, scale: 0.98, y: 0 },
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
      /*
       * `variants` y NO un `animate` con objeto literal.
       *
       * El padre orquesta la entrada con `initial="hidden"` / `animate="show"`,
       * y esa cadena solo llega a los hijos que hablan el mismo idioma. Antes
       * este nodo declaraba las dos cosas a la vez: heredaba el `hidden` del
       * padre (`opacity: 0`) pero su propio `animate` literal pisaba la
       * variante `show`, así que nunca volvía a opacidad 1 — las tarjetas se
       * quedaban invisibles al abrir el tablero, con la columna dibujada y
       * vacía, hasta que cualquier otro render las despertaba.
       *
       * Arrastrando se atenúa: es el hueco que deja la tarjeta mientras el
       * `DragOverlay` la dibuja bajo el cursor.
       */
      variants={cardEntrance}
      layout
      {...attributes}
      {...listeners}
      animate={isDragging ? 'arrastrando' : 'show'}
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
  orientation = 'horizontal',
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sobrePapelera, setSobrePapelera] = useState(false)

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

  // Por defecto dnd-kit compara el RECTANGULO de la tarjeta arrastrada contra
  // cada zona — y esa tarjeta es grande (llena casi todo el ancho en
  // celular). Eso hacia que bajarla hacia una seccion de mas abajo la mandara
  // a la papelera con solo rozar su esquina, mucho antes de "apuntarle" al
  // icono de verdad. Para la papelera puntualmente comparamos la posicion
  // exacta del dedo/cursor en vez del rectangulo completo: solo cuenta si el
  // toque cae adentro del icono. Las columnas siguen usando la deteccion
  // normal (por rectangulo), que ahi si tiene sentido.
  const collisionDetection: CollisionDetection = (args) => {
    if (trashZone) {
      const pointerHits = pointerWithin(args)
      const sobreTacho = pointerHits.find((hit) => hit.id === trashZone.id)
      if (sobreTacho) return [sobreTacho]
    }
    return rectIntersection(args)
  }

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

  // La tarjeta arrastrada tapaba el tacho justo cuando mas importa verlo: al
  // pasarle por encima. Achicarla ahi (ver DragOverlay mas abajo) deja el
  // icono visible para apuntar y soltar con confianza.
  function handleDragMove(event: DragMoveEvent) {
    setSobrePapelera(!!trashZone && event.over?.id === trashZone.id)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setSobrePapelera(false)

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
    <DndContext
      id="kanban-dnd"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={scrollContainerRef}
        className={
          orientation === 'vertical'
            // Sin colchon a la derecha: el tacho ahora solo "atrapa" con el
            // puntero exacto (ver collisionDetection), asi que ya no hace
            // falta robarle ancho a las tarjetas para evitar toques
            // accidentales — se superpone igual que en desktop.
            ? 'flex flex-col gap-5 pb-24'
            : 'flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none'
        }
        style={orientation === 'horizontal' ? { scrollPaddingLeft: '1rem' } : undefined}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            data-kanban-col={col.id}
            className={
              orientation === 'vertical'
                ? 'flex flex-col w-full'
                // En celular las columnas quedan a ancho fijo (85vw, con
                // scroll+snap entre ellas). De md para arriba, en vez de eso
                // dejarlas pegadas a la izquierda con un hueco vacio al lado,
                // que crezcan para repartirse el espacio disponible — con un
                // tope (360px) para que las tarjetas no queden gigantes en
                // pantallas muy anchas.
                //
                // El minimo baja de 272 a 200 en `lg`: con el tablero de cinco
                // columnas del scrum, 272 x 5 mas los huecos pasan de 1400 px y
                // obligaban a desplazarse lateralmente en un portatil normal.
                // Un tablero al que hay que hacerle scroll para ver la ultima
                // columna deja de servir para lo unico que sirve un tablero,
                // que es ver el estado completo de un vistazo.
                : 'flex flex-col w-[85vw] max-w-[272px] shrink-0 snap-start md:w-auto md:min-w-[272px] md:max-w-[360px] md:flex-1 md:shrink lg:min-w-[200px]'
            }
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

      {trashZone && (
        <TrashDropZone
          id={trashZone.id}
          count={trashZone.count}
          dropCount={trashZone.dropCount}
          onOpen={trashZone.onOpen}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <motion.div
            initial={{ scale: 1, rotate: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
            animate={
              sobrePapelera
                ? { scale: 0.4, rotate: -4, opacity: 0.85, boxShadow: '0 10px 20px rgba(0,0,0,0.2)' }
                : { scale: 1.03, rotate: 1, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }
            }
            transition={{ type: 'spring', stiffness: 350, damping: 24 }}
            // Encoger desde la esquina inferior-derecha de la tarjeta original
            // (en vez del centro) sonaba bien para "achicarla hacia el tacho",
            // pero esa esquina esta desplazada del cursor por medio ancho/alto
            // de tarjeta — con el tacho pegado a la esquina de la pantalla eso
            // la encogia hacia un punto mayormente fuera de la vista: invisible
            // justo al soltar. El centro de la tarjeta SI seguia al cursor
            // (se agarra por el medio), asi que encoger desde ahi la deja
            // centrada sobre el icono real.
          >
            {renderCard(activeItem, true)}
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
