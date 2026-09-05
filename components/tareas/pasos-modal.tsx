'use client'

import { useEffect, useState } from 'react'
import { Check, ListChecks } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Subtarea } from '@/lib/types/tarea'
import { porcentajeProgreso, type ProgresoSubtareas } from '@/lib/utils/progreso-subtareas'

interface PasosModalProps {
  /** null = cerrado. Se pasa la tarea entera abierta, no solo el id, para poder
   *  poner el título arriba sin volver a buscarla en la lista. */
  tarea: { id: string; titulo: string } | null
  onOpenChange: (open: boolean) => void
  /** Avisa al tablero cada vez que cambia el conteo, para que la tarjeta de
   *  atrás se actualice mientras el modal sigue abierto. */
  onProgreso: (tareaId: string, progreso: ProgresoSubtareas) => void
}

/**
 * Los pasos de una tarea, marcables desde el tablero.
 *
 * El porqué: en la ficha de la tarea los pasos ya se veían y se marcaban, pero
 * para llegar ahí hay que salir del tablero y volver, y al volver se pierde
 * dónde estabas mirando. Esto es lo mismo sin salir: se abre encima del
 * tablero, se marca, se cierra.
 *
 * Cada fila es un botón de 44px de alto como mínimo — no un checkbox de 16px
 * con la etiqueta al lado. Cristian usa el CRM en el teléfono, y con el pulgar
 * un objetivo de 16px se falla más veces de las que se acierta.
 */
export function PasosModal({ tarea, onOpenChange, onProgreso }: PasosModalProps) {
  const [pasos, setPasos] = useState<Subtarea[] | null>(null)
  const [error, setError] = useState(false)
  const tareaId = tarea?.id ?? null

  // Se limpia durante el render y no dentro del effect: si el borrado viviera
  // en el effect, el primer pintado mostraría los pasos de la tarea ANTERIOR
  // antes de que el effect corriera. Mismo patrón que usa el kanban para
  // sincronizar `initialTareas`.
  const [tareaCargada, setTareaCargada] = useState<string | null>(tareaId)
  if (tareaId !== tareaCargada) {
    setTareaCargada(tareaId)
    setPasos(null)
    setError(false)
  }

  useEffect(() => {
    if (!tareaId) return
    // `vigente`: si alguien cierra el modal y abre otra tarea antes de que
    // llegue esta respuesta, la vieja pintaría los pasos de la tarea anterior
    // sobre la nueva.
    let vigente = true
    fetch(`/api/subtareas?tarea_id=${tareaId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('no ok'))))
      .then((data: Subtarea[]) => {
        if (vigente) setPasos(data)
      })
      .catch(() => {
        if (vigente) setError(true)
      })
    return () => {
      vigente = false
    }
  }, [tareaId])

  async function marcar(paso: Subtarea, completada: boolean) {
    if (!tareaId || !pasos) return
    const siguientes = pasos.map((p) => (p.id === paso.id ? { ...p, completada } : p))
    setPasos(siguientes)
    onProgreso(tareaId, contar(siguientes))

    const res = await fetch(`/api/subtareas/${paso.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completada }),
    })
    if (!res.ok) {
      toast.error('No se pudo marcar el paso')
      // Se revierte SOLO este paso y solo si sigue mostrando lo que puso esta
      // llamada: si mientras tanto se marcó otro (o este mismo al revés),
      // reponer la lista entera pisaría ese cambio ya confirmado.
      setPasos((prev) => {
        if (!prev) return prev
        const revertidos = prev.map((p) =>
          p.id === paso.id && p.completada === completada ? { ...p, completada: !completada } : p,
        )
        onProgreso(tareaId, contar(revertidos))
        return revertidos
      })
    }
  }

  const progreso = pasos ? contar(pasos) : null

  return (
    <Dialog open={tarea !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md max-h-[80svh] overflow-y-auto overflow-x-hidden p-4">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-8 text-left">
            <ListChecks size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{tarea?.titulo ?? 'Pasos'}</span>
          </DialogTitle>
        </DialogHeader>

        {progreso && progreso.total > 0 && (
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-[var(--tx-ink-muted)]">
              {progreso.hechas} de {progreso.total} pasos
            </p>
            {/* Fondo sólido, no backdrop-filter: en el navegador de Cristian
                `backdrop-filter` puede resolver a `none` y la barra quedaría
                invisible sobre el fondo del modal. */}
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  background: 'oklch(72% .17 145)',
                  width: `${porcentajeProgreso(progreso)}%`,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="py-8 text-center text-sm text-[var(--tx-ink-muted)]">
            No se pudieron cargar los pasos.
          </p>
        )}

        {!error && pasos === null && (
          <p className="py-8 text-center text-sm text-[var(--tx-ink-muted)]">Cargando pasos…</p>
        )}

        {!error && pasos !== null && pasos.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--tx-ink-muted)]">
            Esta tarea todavía no tiene pasos. Se agregan desde la tarea.
          </p>
        )}

        {!error && pasos !== null && pasos.length > 0 && (
          // min-w-0: el DialogContent es un grid; sin esto la columna crece al
          // ancho del texto más largo en vez de recortarlo, y en el teléfono el
          // contenido se sale por el costado (mismo caso ya visto en la papelera).
          <div className="flex min-w-0 flex-col divide-y divide-[var(--tx-border)]">
            {pasos.map((paso) => (
              <button
                key={paso.id}
                type="button"
                onClick={() => marcar(paso, !paso.completada)}
                aria-pressed={paso.completada}
                // min-h-11 = 44px reales de alto para el pulgar; el cuadrito se
                // ve de 20px pero lo que responde al toque es la fila entera.
                className="flex min-h-11 w-full min-w-0 items-center gap-3 py-2 text-left transition-colors hover:bg-[var(--tx-surface-2)]"
              >
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors"
                  style={
                    paso.completada
                      ? { background: 'oklch(72% .17 145)', borderColor: 'oklch(72% .17 145)' }
                      : { background: 'transparent', borderColor: 'var(--tx-border)' }
                  }
                >
                  {paso.completada && <Check size={13} strokeWidth={3} color="oklch(18% 0.02 145)" />}
                </span>
                <span
                  className={
                    paso.completada
                      ? 'min-w-0 flex-1 break-words text-sm text-[var(--tx-ink-muted)] line-through'
                      : 'min-w-0 flex-1 break-words text-sm text-[var(--tx-ink-primary)]'
                  }
                >
                  {paso.descripcion}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function contar(pasos: Subtarea[]): ProgresoSubtareas {
  return { hechas: pasos.filter((p) => p.completada).length, total: pasos.length }
}
