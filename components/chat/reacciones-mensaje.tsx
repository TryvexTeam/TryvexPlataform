'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReaccionAgrupada } from '@/lib/types/chat'

interface ReaccionesMensajeProps {
  reacciones: ReaccionAgrupada[]
  onAlternar: (emoji: string) => void
}

/**
 * Las píldoras de emoji bajo un mensaje: "👍 3".
 *
 * Cada una es un interruptor. La propia se pinta con el color de acento y borde
 * marcado, porque en un chat de equipo importa saber de un vistazo si ya reaccionaste
 * — sin eso uno vuelve a hacer clic y termina quitando su propia reacción.
 *
 * El `title` de siempre solo se ve con el mouse encima, y en el teléfono -donde
 * de verdad se usan las reacciones- no hay hover. Por eso el clic hace las dos
 * cosas: alterna la reacción Y muestra por un momento quién más la puso, sin
 * agregar un botón nuevo ni cambiar el tamaño de la píldora.
 */
export function ReaccionesMensaje({ reacciones, onAlternar }: ReaccionesMensajeProps) {
  const [emojiMostrado, setEmojiMostrado] = useState<string | null>(null)
  const cierreRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (cierreRef.current) clearTimeout(cierreRef.current)
  }, [])

  if (reacciones.length === 0) return null

  const manejarClic = (r: ReaccionAgrupada) => {
    onAlternar(r.emoji)
    setEmojiMostrado(r.emoji)
    if (cierreRef.current) clearTimeout(cierreRef.current)
    cierreRef.current = setTimeout(() => setEmojiMostrado(null), 2500)
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reacciones.map((r) => (
        <div key={r.emoji} className="relative">
          {emojiMostrado === r.emoji && (
            // Anclado por izquierda, no centrado: centrarlo empujaba la mitad del
            // popover más allá del borde del panel de chat en píldoras cerca del
            // margen, y el contenedor con scroll lo recortaba a la mitad. Crece
            // hacia la derecha desde la píldora, que es donde siempre hay espacio.
            <div
              role="tooltip"
              className="animate-in fade-in slide-in-from-bottom-1 absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[min(240px,80vw)] origin-bottom-left rounded-lg px-2.5 py-1.5 text-[12px] leading-4 shadow-[0_4px_16px_rgb(0_0_0_/_0.35)] backdrop-blur-md duration-150"
              style={{
                background: 'var(--tx-surface-2, oklch(24% 0.01 255 / 96%))',
                color: 'var(--tx-ink-primary)',
                border: '1px solid var(--tx-border, oklch(100% 0 0 / 12%))',
              }}
            >
              {tituloDe(r)}
              <div
                aria-hidden
                className="absolute top-full left-3 h-2 w-2 -translate-y-1/2 rotate-45"
                style={{
                  background: 'var(--tx-surface-2, oklch(24% 0.01 255 / 96%))',
                  borderRight: '1px solid var(--tx-border, oklch(100% 0 0 / 12%))',
                  borderBottom: '1px solid var(--tx-border, oklch(100% 0 0 / 12%))',
                }}
              />
            </div>
          )}
          <button
            onClick={() => manejarClic(r)}
            title={tituloDe(r)}
            aria-label={tituloDe(r)}
            aria-pressed={r.mia}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-5 transition-colors active:scale-[0.94]"
            style={{
              background: r.mia ? 'var(--tx-accent-soft, oklch(62% 0.19 255 / 18%))' : 'oklch(100% 0 0 / 6%)',
              border: `1px solid ${r.mia ? 'var(--tx-accent, oklch(62% 0.19 255))' : 'transparent'}`,
              color: 'var(--tx-ink-primary)',
              transition: 'transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 150ms, border-color 150ms',
            }}
          >
            <span aria-hidden>{r.emoji}</span>
            <span className="tabular-nums">{r.cuenta}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

/** "Ignacio y Spike reaccionaron con 👍" — quién reaccionó importa tanto como cuántos. */
function tituloDe(r: ReaccionAgrupada): string {
  const nombres = r.quienes.slice(0, 8)
  const resto = r.quienes.length - nombres.length

  const lista =
    nombres.length <= 1
      ? (nombres[0] ?? '')
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

  const cola = resto > 0 ? ` y ${resto} más` : ''
  const verbo = r.cuenta === 1 ? 'reaccionó' : 'reaccionaron'

  return `${lista}${cola} ${verbo} con ${r.emoji}`
}
