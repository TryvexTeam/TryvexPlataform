'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from '@/lib/toast'
import { KanbanBoard, type KanbanColumn } from '@/components/shared/kanban-board'
import { AvatarIntegrante } from '@/components/shared/avatar-integrante'
import { ESTADOS_TAREA, type EstadoTarea, type TareaConResponsables } from '@/lib/types/tarea'

/**
 * Tablero scrum de un proyecto.
 *
 * Las tareas son las mismas de `/tareas` filtradas por proyecto, no una copia:
 * mover una tarjeta aquí la mueve también en el tablero general y en los
 * pendientes del Panel de Mando. Eso es lo que se pidió — que el trabajo del
 * proyecto cuente como trabajo, sin tener que apuntarlo dos veces.
 *
 * Reutiliza `shared/kanban-board`, el mismo de leads y tareas: es regla del
 * proyecto no duplicar la lógica de arrastre.
 */

interface PipelineProyectoProps {
  /** Ya filtradas por proyecto: el tablero no vuelve a consultarlas. */
  tareas: TareaConResponsables[]
}

/** El color de cada columna, de frío a cálido y cerrando en verde. */
const COLOR_COLUMNA: Record<EstadoTarea, string> = {
  backlog: '#64748b',
  sin_empezar: '#94a3b8',
  en_curso: '#f59e0b',
  en_revision: '#a78bfa',
  listo: '#22c55e',
}

const COLOR_PRIORIDAD: Record<string, string> = {
  alta: 'var(--tx-error)',
  media: 'var(--tx-warning)',
  baja: 'var(--tx-ink-muted)',
}

export function PipelineProyecto({ tareas }: PipelineProyectoProps) {
  const router = useRouter()
  const sinMovimiento = useReducedMotion()
  // Copia local para que la tarjeta se mueva con el dedo y no después de que
  // responda el servidor. Si la petición falla, se revierte y se avisa.
  const [items, setItems] = useState(tareas)

  const columns: KanbanColumn<TareaConResponsables>[] = ESTADOS_TAREA.map((e) => ({
    id: e.id,
    title: e.label,
    color: COLOR_COLUMNA[e.id],
    items: items.filter((t) => t.estado === e.id && !t.eliminado_at),
  }))

  const alSoltar = useCallback(
    async (tareaId: string, _desde: string, hacia: string) => {
      const respaldo = items
      setItems((prev) =>
        prev.map((t) => (t.id === tareaId ? { ...t, estado: hacia as EstadoTarea } : t)),
      )

      try {
        const res = await fetch(`/api/tareas/${tareaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: hacia }),
        })
        if (!res.ok) throw new Error('No se pudo mover la tarea')
        // El servidor manda: refresca para que el resto de la ficha (el
        // contador de completadas, por ejemplo) no quede desfasado.
        router.refresh()
      } catch (error: unknown) {
        setItems(respaldo)
        toast.error(error instanceof Error ? error.message : 'No se pudo mover la tarea')
      }
    },
    [items, router],
  )

  const total = items.filter((t) => !t.eliminado_at).length
  const hechas = items.filter((t) => t.estado === 'listo' && !t.eliminado_at).length
  const avance = total === 0 ? 0 : Math.round((hechas / total) * 100)

  if (total === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/[0.10] px-4 py-10 text-center">
        <p className="text-[13px] font-medium text-[var(--tx-ink-primary)]">Sin tareas todavía</p>
        <p className="mt-2 text-[12px] text-[var(--tx-ink-secondary)]">
          Este proyecto se creó sin plantilla de servicio. Puedes añadir tareas desde el tablero
          general.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* El avance va arriba y en grande: es lo que se viene a mirar al abrir
          un proyecto, antes que ninguna tarjeta concreta. */}
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-2">
          <p className="text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--tx-ink-primary)]">
            {avance}%
          </p>
          <p className="text-[13px] text-[var(--tx-ink-secondary)]">
            {hechas} de {total} {total === 1 ? 'tarea' : 'tareas'}
          </p>
        </div>

        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className="h-1.5 rounded-full"
            initial={sinMovimiento ? false : { width: 0 }}
            animate={{ width: `${avance}%` }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
            style={{ background: avance === 100 ? 'oklch(72% .17 145)' : 'var(--tx-accent)' }}
          />
        </div>
      </div>

      <KanbanBoard
        columns={columns}
        onDragEnd={alSoltar}
        renderCard={(tarea) => (
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-white/[0.07] bg-white/[0.038] p-3.5">
            <p className="text-[13px] font-medium leading-snug text-[var(--tx-ink-primary)]">
              {tarea.titulo}
            </p>

            {tarea.descripcion && (
              /* La descripción va en secundario, no en muted: es contenido que
                 hay que poder leer, no un metadato. */
              <p className="line-clamp-2 text-[12px] leading-snug text-[var(--tx-ink-secondary)]">
                {tarea.descripcion}
              </p>
            )}

            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[10.5px] font-medium"
                style={{
                  borderColor: 'rgba(255,255,255,.10)',
                  color: COLOR_PRIORIDAD[tarea.prioridad] ?? 'var(--tx-ink-secondary)',
                }}
              >
                {tarea.prioridad}
              </span>

              <div className="flex-1" />

              {tarea.responsables.slice(0, 3).map((r, i) => (
                <span
                  key={r.integrante_id}
                  style={{ marginLeft: i > 0 ? -8 : 0, position: 'relative', zIndex: 3 - i }}
                >
                  <AvatarIntegrante nombre={r.nombre} avatarUrl={r.avatar_url} size={22} />
                </span>
              ))}
            </div>
          </div>
        )}
      />
    </div>
  )
}
