'use client'

import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'framer-motion'

/**
 * Cifra que cuenta desde cero al aparecer.
 *
 * El conteo no es decoración: la cifra se mueve una vez, al entrar, y eso es
 * lo que dirige la mirada al dato antes que a la caja que lo contiene. Después
 * se queda quieta para siempre.
 *
 * Escribe directo en el nodo del DOM en vez de pasar por estado de React: son
 * ~60 fotogramas por segundo y un `setState` por fotograma re-renderizaría el
 * árbol entero para cambiar un texto.
 *
 * Con `prefers-reduced-motion` el número aparece ya formado, sin conteo.
 */

interface CifraAnimadaProps {
  valor: number
  /** Envuelve el número formateado; por defecto, separador de miles chileno. */
  formato?: (n: number) => string
  className?: string
  style?: React.CSSProperties
}

const DURACION_BASE = 0.9

function formatoPorDefecto(n: number): string {
  return Math.round(n).toLocaleString('es-CL')
}

export function CifraAnimada({
  valor,
  formato = formatoPorDefecto,
  className,
  style,
}: CifraAnimadaProps) {
  const nodo = useRef<HTMLSpanElement>(null)
  const visible = useInView(nodo, { once: true, margin: '-40px' })
  const sinMovimiento = useReducedMotion()

  useEffect(() => {
    const el = nodo.current
    if (!el) return

    if (sinMovimiento || !visible) {
      // Sin animación el nodo igual necesita su valor final: si no, quedaría
      // el "0" del render inicial hasta que algo más lo toque.
      if (sinMovimiento) el.textContent = formato(valor)
      return
    }

    // Cifras chicas cuentan rápido; las grandes se toman algo más, pero el
    // tope evita que un saldo de siete dígitos se quede girando.
    const duracion = Math.min(DURACION_BASE, 0.35 + Math.log10(Math.max(valor, 1)) * 0.22)

    const control = animate(0, valor, {
      duration: duracion,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => {
        el.textContent = formato(n)
      },
    })

    return () => control.stop()
  }, [valor, visible, sinMovimiento, formato])

  return (
    <span ref={nodo} className={className} style={style}>
      {/* El servidor pinta el valor final: sin JS, la cifra correcta igual se
          ve. El efecto la lleva a cero y la sube solo cuando puede animar. */}
      {formato(valor)}
    </span>
  )
}
