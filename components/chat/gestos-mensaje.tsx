'use client'

import { useRef, useState } from 'react'
import { ReplyIcon } from 'lucide-react'

interface GestosMensajeProps {
  /** Deslizar a la derecha más allá del umbral. */
  onResponder: () => void
  /** Mantener presionado: recibe el elemento para anclar el menú a su posición. */
  onMenu: (elemento: HTMLElement) => void
  children: React.ReactNode
}

/** Cuánto hay que arrastrar para que el gesto de responder cuente. */
const UMBRAL_DESLIZAR = 60
/** Cuánto hay que sostener para abrir el menú. */
const MS_PARA_MENU = 450
/** Un dedo nunca queda del todo quieto. */
const TOLERANCIA = 10
/** Los primeros píxeles del borde izquierdo son del gesto "atrás" de la pantalla. */
const BORDE_ATRAS = 24

/**
 * Gestos táctiles de un mensaje, como WhatsApp para iPhone:
 *  · deslizar a la derecha responde (el icono aparece y crece con el arrastre);
 *  · mantener presionado abre el menú con la burbuja elevada.
 *
 * Solo escucha touch: con mouse mandan el clic derecho y el chevron de hover.
 */
export function GestosMensaje({ onResponder, onMenu, children }: GestosMensajeProps) {
  const [desplazado, setDesplazado] = useState(0)
  const [presionando, setPresionando] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const yaDisparo = useRef(false)
  const pasoUmbral = useRef(false)

  const cancelarEspera = () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }

  const alTocar = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t.clientX <= BORDE_ATRAS) return
    inicio.current = { x: t.clientX, y: t.clientY }
    yaDisparo.current = false
    pasoUmbral.current = false
    setPresionando(true)
    temporizador.current = setTimeout(() => {
      yaDisparo.current = true
      navigator.vibrate?.(15)
      if (raiz.current) onMenu(raiz.current)
    }, MS_PARA_MENU)
  }

  const alMover = (e: React.TouchEvent) => {
    if (!inicio.current) return
    const t = e.touches[0]
    const dx = t.clientX - inicio.current.x
    const dy = t.clientY - inicio.current.y
    if (Math.abs(dx) > TOLERANCIA || Math.abs(dy) > TOLERANCIA) {
      cancelarEspera()
      setPresionando(false)
    }
    // Vertical manda: si está scrolleando la conversación no se arrastra nada.
    if (Math.abs(dy) > Math.abs(dx) || dx <= 0) return
    const frenado = Math.min(dx, UMBRAL_DESLIZAR + (dx - UMBRAL_DESLIZAR) * 0.2)
    if (dx >= UMBRAL_DESLIZAR && !pasoUmbral.current) {
      pasoUmbral.current = true
      navigator.vibrate?.(10)
    }
    setDesplazado(Math.max(0, frenado))
  }

  const alSoltar = (e: React.TouchEvent) => {
    // Si el long-press ya abrió el menú, soltar el dedo no debe "hacer clic" en el
    // ítem del menú que quedó debajo (el navegador emite un click tras touchend).
    if (yaDisparo.current && e.cancelable) e.preventDefault()
    cancelarEspera()
    setPresionando(false)
    if (desplazado >= UMBRAL_DESLIZAR && !yaDisparo.current) onResponder()
    setDesplazado(0)
    inicio.current = null
  }

  const avance = Math.min(desplazado / UMBRAL_DESLIZAR, 1)

  return (
    <div className="relative" ref={raiz} data-presionando={presionando || undefined}>
      {desplazado > 0 && (
        <span
          className="absolute left-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full"
          style={{
            background: avance >= 1 ? 'var(--chat-accent)' : 'var(--chat-surface-soft)',
            color: avance >= 1 ? 'var(--tx-accent-fg)' : 'var(--chat-meta)',
            opacity: avance,
            transform: `translateY(-50%) scale(${0.5 + avance * 0.5})`,
          }}
          aria-hidden
        >
          <ReplyIcon className="size-4" />
        </span>
      )}
      <div
        onTouchStart={alTocar}
        onTouchMove={alMover}
        onTouchEnd={alSoltar}
        onTouchCancel={alSoltar}
        style={{
          transform: `translateX(${desplazado}px)`,
          // Sin transición mientras el dedo arrastra; solo al soltar.
          transition: desplazado === 0 ? 'transform 180ms var(--chat-curva-ios)' : 'none',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
