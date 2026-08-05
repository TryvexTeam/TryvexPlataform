'use client'

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
 */
export function ReaccionesMensaje({ reacciones, onAlternar }: ReaccionesMensajeProps) {
  if (reacciones.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reacciones.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onAlternar(r.emoji)}
          title={tituloDe(r)}
          aria-label={tituloDe(r)}
          aria-pressed={r.mia}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-5 transition-colors"
          style={{
            background: r.mia ? 'var(--tx-accent-soft, oklch(62% 0.19 255 / 18%))' : 'oklch(100% 0 0 / 6%)',
            border: `1px solid ${r.mia ? 'var(--tx-accent, oklch(62% 0.19 255))' : 'transparent'}`,
            color: 'var(--tx-ink-primary)',
          }}
        >
          <span aria-hidden>{r.emoji}</span>
          <span className="tabular-nums">{r.cuenta}</span>
        </button>
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
