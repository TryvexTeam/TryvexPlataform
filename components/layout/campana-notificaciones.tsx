'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { BellIcon } from 'lucide-react'

/**
 * Campana del topbar.
 *
 * Cuando entra algo nuevo la campana se mece: dos oscilaciones cortas que
 * decaen, como una campana de verdad. Es el único momento en que la interfaz
 * se mueve sola, y por eso funciona — si todo vibrara, esto no diría nada.
 *
 * El badge entra con un rebote y la cifra sube; en ningún caso se anima al
 * abrir el panel ni al marcar leídas: el movimiento anuncia lo que llega, no
 * acompaña lo que uno hace.
 *
 * `useAnimationControls` en vez de estado + `animate`: el meneo se dispara una
 * vez y termina, no es un estado de la interfaz que haya que mantener.
 */

interface CampanaNotificacionesProps {
  noLeidas: number
  abierto?: boolean
}

/** Grados de cada oscilación. Van decayendo hasta parar. */
const OSCILACIONES = [0, -13, 11, -8, 5, -3, 0]

export function CampanaNotificaciones({ noLeidas, abierto = false }: CampanaNotificacionesProps) {
  const controles = useAnimationControls()
  const sinMovimiento = useReducedMotion()
  // El valor previo se guarda en una ref, no en estado: solo sirve para
  // comparar entre renders y no debe provocar uno por su cuenta.
  const anterior = useRef(noLeidas)
  const [rebote, setRebote] = useState(false)

  useEffect(() => {
    const subio = noLeidas > anterior.current
    anterior.current = noLeidas
    if (!subio || sinMovimiento) return

    void controles.start({
      rotate: OSCILACIONES,
      transition: { duration: 0.75, ease: 'easeOut', times: [0, 0.12, 0.28, 0.45, 0.62, 0.8, 1] },
    })

    setRebote(true)
    const t = setTimeout(() => setRebote(false), 420)
    return () => clearTimeout(t)
  }, [noLeidas, controles, sinMovimiento])

  return (
    <span className="relative inline-flex">
      <motion.span
        className="inline-flex"
        animate={controles}
        // El pivote arriba: una campana gira desde donde cuelga, no desde su
        // centro. Girarla por el medio la haría parecer un reloj.
        style={{ originY: 0.15 }}
      >
        <BellIcon size={17} aria-hidden="true" />
      </motion.span>

      {noLeidas > 0 && (
        <motion.span
          className="absolute -right-1.5 -top-1 flex h-[17px] min-w-[17px] items-center justify-center
            rounded-full px-1 text-[10px] font-semibold tabular-nums"
          style={{
            background: 'var(--tx-accent)',
            // Contraste calculado contra el acento, no blanco fijo: con un
            // acento claro (p. ej. el tema "Modo Minimalista") el número
            // quedaba invisible sobre su propio fondo.
            color: 'var(--tx-accent-fg)',
            // Un aro del color del fondo separa el badge del icono sin
            // dibujarle un borde que compita con el acento.
            boxShadow: '0 0 0 2px var(--tx-bg-primary)',
          }}
          initial={sinMovimiento ? false : { scale: 0.4, opacity: 0 }}
          animate={{
            scale: rebote && !sinMovimiento ? [1, 1.28, 1] : 1,
            opacity: 1,
          }}
          /*
           * La escala del rebote va por `duration`, no por `spring`.
           *
           * Un muelle solo entiende de dónde sale y a dónde llega: no puede
           * recorrer una secuencia de keyframes. Al pedirle [1, 1.28, 1] con
           * `type: 'spring'`, Motion lanzaba un error en cada aviso nuevo
           * ("Only two keyframes currently supported with spring").
           *
           * El resto de propiedades sí conservan el muelle: la aparición del
           * badge es un salto de un valor a otro, que es justo lo que un
           * muelle hace bien.
           */
          transition={{
            scale: rebote
              ? { duration: 0.42, ease: 'easeOut' }
              : { type: 'spring', stiffness: 520, damping: 18 },
            opacity: { type: 'spring', stiffness: 520, damping: 18 },
          }}
        >
          {noLeidas > 9 ? '9+' : noLeidas}
        </motion.span>
      )}

      {/* Halo que se expande una vez, como el toque de una campana. Va detrás
          del icono y no captura el puntero. */}
      {rebote && !sinMovimiento && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'var(--tx-accent)' }}
          initial={{ scale: 0.5, opacity: 0.35 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}

      {/* Marca sutil de panel abierto: el icono ya cambia de color por CSS,
          esto solo asienta el estado para quien mira de reojo. */}
      {abierto && (
        <motion.span
          layoutId="campana-activa"
          aria-hidden="true"
          className="absolute -bottom-2 left-1/2 h-[3px] w-3 -translate-x-1/2 rounded-full"
          style={{ background: 'var(--tx-accent)' }}
        />
      )}
    </span>
  )
}
