'use client'

import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'tx-boton-en-llamada-pos'
const MARGEN = 12

interface BotonEnLlamadaProps {
  onRestaurar: () => void
  ensordecido: boolean
  participantesCount: number
}

/**
 * El botón de "en llamada" (minimizada) es global — vive encima de
 * cualquier página — y en Tareas quedaba tapando el ícono de la papelera,
 * que también flota fijo en esa esquina. En vez de esquivarlo con una
 * posición fija a medida (que se rompe apenas otra página tenga algo ahí),
 * se puede arrastrar: cada uno lo deja donde le acomode y queda ahí
 * (guardado en localStorage) para la próxima vez.
 */
export function BotonEnLlamada({ onRestaurar, ensordecido, participantesCount }: BotonEnLlamadaProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [listo, setListo] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  function clamp(x: number, y: number) {
    const w = btnRef.current?.offsetWidth ?? 160
    const h = btnRef.current?.offsetHeight ?? 44
    const maxX = Math.max(window.innerWidth - w - MARGEN, MARGEN)
    const maxY = Math.max(window.innerHeight - h - MARGEN, MARGEN)
    return { x: Math.min(Math.max(x, MARGEN), maxX), y: Math.min(Math.max(y, MARGEN), maxY) }
  }

  // Se lee recien montado (no en el render) porque necesita medir el propio
  // boton para no dejarlo a medio salir de la pantalla si la ventana cambio
  // de tamaño desde la ultima vez que se guardo.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const saved = raw ? JSON.parse(raw) : null
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        setPos(clamp(saved.x, saved.y))
      }
    } catch {
      // localStorage corrupto o inaccesible: se queda en la posicion default
    }
    setListo(true)
  }, [])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    // Umbral chico para no confundir un tap tembloroso con un drag, pero
    // que arrastrar de verdad se sienta inmediato.
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    drag.moved = true
    setPos(clamp(drag.origX + dx, drag.origY + dy))
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.moved) {
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
          } catch {
            // sin persistencia esta vez, no es grave
          }
        }
        return p
      })
    } else {
      onRestaurar()
    }
  }

  return (
    <button
      ref={btnRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { dragRef.current = null }}
      className={`fixed z-[80] flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg cursor-grab touch-none select-none active:cursor-grabbing ${
        pos ? '' : 'bottom-24 md:bottom-6 right-3 md:right-6'
      }`}
      style={{
        background: 'var(--tx-accent)',
        color: 'var(--tx-accent-fg)',
        opacity: listo ? 1 : 0,
        ...(pos ? { left: pos.x, top: pos.y } : {}),
      }}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span className="text-[13px] font-semibold">
        {ensordecido ? 'Ensordecido' : 'En llamada'} · {participantesCount}
      </span>
    </button>
  )
}
