'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

/**
 * Carrusel de tarjetas de lead.
 *
 * En celular es un carril deslizable con scroll-snap nativo: se arrastra con
 * el dedo y cada tarjeta cae en su sitio. Desde `md` se convierte en grilla —
 * con espacio de sobra, esconder tarjetas detrás de un gesto sería peor.
 *
 * El scroll lo maneja el navegador, no JavaScript: momentum, rebote y
 * accesibilidad de teclado salen gratis y no hay que reimplementarlos. El
 * estado local solo escucha para pintar el indicador y habilitar las flechas.
 *
 * El indicador no son puntos: es una barra segmentada donde el segmento
 * activo se ensancha. Dice a la vez cuántos hay y en cuál vas, en una sola
 * forma y sin números.
 */

interface CarruselLeadsProps {
  children: ReactNode[]
  /** Etiqueta del carril para lectores de pantalla. */
  etiqueta: string
}

export function CarruselLeads({ children, etiqueta }: CarruselLeadsProps) {
  const carril = useRef<HTMLDivElement>(null)
  const [activo, setActivo] = useState(0)
  const [desbordado, setDesbordado] = useState(false)
  const sinMovimiento = useReducedMotion()
  const total = children.length

  /** Índice de la tarjeta más cercana al borde de arranque del carril. */
  const sincronizar = useCallback(() => {
    const el = carril.current
    if (!el) return

    setDesbordado(el.scrollWidth > el.clientWidth + 1)

    const tarjetas = Array.from(el.children) as HTMLElement[]
    if (tarjetas.length === 0) return

    // Se mide contra el scroll real, no contra un contador propio: así el
    // indicador sigue al dedo aunque el gesto se quede a medio camino.
    let masCerca = 0
    let menorDistancia = Infinity
    for (const [i, tarjeta] of tarjetas.entries()) {
      const distancia = Math.abs(tarjeta.offsetLeft - el.scrollLeft - el.offsetLeft)
      if (distancia < menorDistancia) {
        menorDistancia = distancia
        masCerca = i
      }
    }
    setActivo(masCerca)
  }, [])

  useEffect(() => {
    sincronizar()
    const el = carril.current
    if (!el) return

    // ResizeObserver y no un listener de `resize`: el carril también cambia
    // de ancho cuando se abre la barra lateral, sin que la ventana se mueva.
    const observador = new ResizeObserver(sincronizar)
    observador.observe(el)
    return () => observador.disconnect()
  }, [sincronizar, total])

  const desplazar = useCallback((direccion: -1 | 1) => {
    const el = carril.current
    if (!el) return
    const tarjeta = el.children[0] as HTMLElement | undefined
    const paso = tarjeta ? tarjeta.offsetWidth + 20 : el.clientWidth * 0.8
    el.scrollBy({ left: paso * direccion, behavior: 'smooth' })
  }, [])

  return (
    <div className="relative">
      <div
        ref={carril}
        onScroll={sincronizar}
        role="group"
        aria-label={etiqueta}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4
          md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4"
      >
        {children.map((hijo, i) => (
          <div
            key={i}
            className="w-[78vw] max-w-[300px] shrink-0 snap-start md:w-auto md:max-w-none md:shrink"
          >
            {hijo}
          </div>
        ))}
      </div>

      {/* Indicador + flechas: solo cuando el carril realmente desborda. */}
      {desbordado && total > 1 && (
        <div className="mt-5 flex items-center gap-4 md:hidden">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
            {children.map((_, i) => (
              <motion.span
                key={i}
                className="h-[3px] rounded-full"
                animate={{
                  width: i === activo ? 26 : 10,
                  backgroundColor:
                    i === activo ? 'var(--tx-accent)' : 'rgba(255,255,255,.14)',
                }}
                transition={
                  sinMovimiento
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 30 }
                }
              />
            ))}
          </div>

          <p className="text-[11px] tabular-nums text-[var(--tx-ink-muted)]">
            {activo + 1} / {total}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => desplazar(-1)}
              disabled={activo === 0}
              aria-label="Lead anterior"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.09]
                text-[var(--tx-ink-secondary)] transition-opacity disabled:opacity-30"
            >
              <ChevronLeftIcon size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => desplazar(1)}
              disabled={activo === total - 1}
              aria-label="Lead siguiente"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.09]
                text-[var(--tx-ink-secondary)] transition-opacity disabled:opacity-30"
            >
              <ChevronRightIcon size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
