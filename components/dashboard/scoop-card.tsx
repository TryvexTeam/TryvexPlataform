'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { ArrowUpRightIcon, type LucideIcon } from 'lucide-react'

/**
 * Card con muesca — la firma visual del Panel de Mando.
 *
 * La esquina superior derecha se recorta con una curva cóncava (`.tx-scoop`,
 * definida en `globals.css`) y el botón de acción queda alojado en ese hueco.
 *
 * El botón NO es hijo del card: es hermano, encima. Si fuera hijo, la máscara
 * que abre la muesca también lo recortaría.
 *
 * Regla de uso: la muesca promete navegación. Solo lleva muesca un card con
 * ruta real; sin destino, `href` se omite y el card va con esquina normal.
 *
 * Client Component por el movimiento. Los hijos siguen siendo Server
 * Components: llegan ya renderizados como slot, sin hidratar de más.
 */

interface ScoopCardProps {
  children: ReactNode
  /** Destino del botón de la muesca. Sin él, el card no lleva muesca. */
  href?: string
  /** Texto del botón para lectores de pantalla. Obligatorio si hay `href`. */
  accion?: string
  /** Icono del botón; por defecto la flecha de "ir a". */
  Icono?: LucideIcon
  /** Tarjeta de acento: fondo rojo profundo con trama. Una por pantalla. */
  acento?: boolean
  /** Clases extra del contenedor interno (padding, alto, columnas). */
  className?: string
  /** Posición en la lista: escalona la entrada 45 ms por tarjeta. */
  indice?: number
}

/** Tope del escalonado: pasado esto, todo entra a la vez. Una lista larga no
 *  puede hacer esperar dos segundos a la última tarjeta. */
const MAX_ESCALON = 8
const PASO_ESCALON = 0.045

/** Cuánto viaja cada flecha del relevo, en píxeles de su diagonal. */
const VIAJE = 16

const MUELLE = { type: 'spring', stiffness: 400, damping: 30 } as const

export function ScoopCard({
  children,
  href,
  accion,
  Icono = ArrowUpRightIcon,
  acento = false,
  className = '',
  indice = 0,
}: ScoopCardProps) {
  // El estado se lleva a mano en vez de dejarlo a la propagación de variantes:
  // así el mismo gesto lo dispara tanto el puntero sobre la tarjeta entera
  // como el foco de teclado sobre el botón. Con `whileHover` solo habría hover.
  const [activo, setActivo] = useState(false)
  const sinMovimiento = useReducedMotion()

  // El acento relleno usa el rojo profundo, no `--tx-accent`: sobre el acento
  // normal el texto blanco pequeño se queda en 4.22:1 y no llega al mínimo.
  const superficie = acento
    ? 'bg-[var(--tx-accent-surface)] border-white/15'
    : 'bg-white/[0.038] border-white/[0.07]'

  const retraso = Math.min(indice, MAX_ESCALON) * PASO_ESCALON
  const encendido = activo && !sinMovimiento

  return (
    <motion.div
      className="group relative"
      onHoverStart={() => setActivo(true)}
      onHoverEnd={() => setActivo(false)}
      initial={sinMovimiento ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: retraso }}
      whileHover={sinMovimiento ? undefined : { y: -3 }}
    >
      <div
        className={`relative rounded-[28px] border transition-colors duration-200 ${superficie} ${
          href && !acento ? 'group-hover:border-white/[0.13] group-hover:bg-white/[0.06]' : ''
        } ${href ? 'tx-scoop' : ''} ${className}`}
      >
        {acento && <div className="tx-hatch rounded-[28px]" aria-hidden="true" />}
        {href && !acento && <div className="tx-scoop-edge" aria-hidden="true" />}
        {/* `relative` para que el contenido quede sobre la trama del acento. */}
        <div className="relative">{children}</div>
      </div>

      {/* Sin `scale` al pasar el cursor: el botón crecería dentro del hueco y
          se comería los 12 px de aire que definen la muesca. Al pulsar sí
          encoge — eso va hacia dentro y la geometría no sufre. */}
      {href && (
        <motion.div
          className="absolute right-0 top-0"
          whileTap={sinMovimiento ? undefined : { scale: 0.94 }}
          transition={MUELLE}
        >
          <Link
            href={href}
            aria-label={accion}
            onFocus={() => setActivo(true)}
            onBlur={() => setActivo(false)}
            /* En reposo el círculo es discreto; activo se vuelve blanco con el
               icono oscuro. Invertir en vez de teñir de rojo es lo que da
               contraste real: blanco sobre el acento se queda en 4.22:1 y se
               lee lavado; esto llega a 19:1. */
            className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full
              border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[var(--tx-accent-2)] ${
                activo
                  ? 'border-white bg-white text-[var(--tx-bg-primary)]'
                  : acento
                    ? 'border-white/15 bg-[var(--tx-bg-primary)] text-white'
                    : 'border-white/[0.13] bg-white/[0.06] text-white'
              }`}
          >
            {/* Relevo de flechas: la primera sale por su propia diagonal y otra
                idéntica entra desde la esquina opuesta. El `overflow-hidden`
                del botón las recorta, así que se lee como una sola flecha
                atravesando, no como dos iconos moviéndose. */}
            <motion.span
              className="absolute flex"
              animate={
                encendido ? { x: VIAJE, y: -VIAJE, opacity: 0 } : { x: 0, y: 0, opacity: 1 }
              }
              transition={MUELLE}
            >
              <Icono size={16} aria-hidden="true" />
            </motion.span>

            <motion.span
              className="absolute flex"
              aria-hidden="true"
              animate={
                encendido ? { x: 0, y: 0, opacity: 1 } : { x: -VIAJE, y: VIAJE, opacity: 0 }
              }
              transition={MUELLE}
            >
              <Icono size={16} aria-hidden="true" />
            </motion.span>
          </Link>
        </motion.div>
      )}
    </motion.div>
  )
}
