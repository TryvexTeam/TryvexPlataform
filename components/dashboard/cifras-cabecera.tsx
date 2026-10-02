'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { CifraAnimada } from '@/components/dashboard/cifra-animada'

/**
 * Cifras de cabecera del panel.
 *
 * Van como texto separado por hairlines, no como tarjetas: cuatro números no
 * necesitan cuatro cajas. Sacarles el marco es lo que deja respirar el resto
 * de la pantalla y evita que todo tenga el mismo peso visual.
 *
 * En celular hacen scroll horizontal — apilarlas comería el viewport entero
 * antes de llegar a lo accionable.
 */

export interface Cifra {
  id: string
  valor: number
  label: string
  href?: string
  /** Prefijo o sufijo pegado al número (por ejemplo, la unidad de un monto). */
  sufijo?: string
  prefijo?: string
  /** Pinta la cifra en acento. Reservado para lo que exige atención. */
  alerta?: boolean
}

interface CifrasCabeceraProps {
  cifras: Cifra[]
}

export function CifrasCabecera({ cifras }: CifrasCabeceraProps) {
  const sinMovimiento = useReducedMotion()

  return (
    // El desvanecido del borde derecho (`mask-image`, solo en celular) es la
    // única pista de que la fila sigue para el lado — sin él, la última cifra
    // se ve "cortada" contra el borde de la pantalla y parece un error, no una
    // invitación a deslizar. Los otros carruseles del panel (leads, tareas del
    // equipo) tienen puntitos de paginación; esta fila de texto no tiene dónde
    // ponerlos, así que la señal va en el propio borde.
    <div
      className="no-scrollbar -mx-4 flex items-end overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent_100%)] md:mx-0 md:px-0 md:[mask-image:none]"
    >
      {cifras.map((cifra, i) => {
        const contenido = (
          <>
            <p
              className="text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums md:text-[44px]"
              style={{ color: cifra.alerta ? 'var(--tx-accent-2)' : 'var(--tx-ink-primary)' }}
            >
              {cifra.prefijo}
              <CifraAnimada valor={cifra.valor} />
              {cifra.sufijo && (
                <span className="ml-0.5 text-[18px] font-medium text-[var(--tx-ink-muted)]">
                  {cifra.sufijo}
                </span>
              )}
            </p>
            <p className="mt-3 whitespace-nowrap text-xs text-[var(--tx-ink-secondary)]">
              {cifra.label}
            </p>
          </>
        )

        return (
          <motion.div
            key={cifra.id}
            className="flex shrink-0 items-end"
            initial={sinMovimiento ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26, delay: i * 0.06 }}
          >
            {i > 0 && <div className="mb-1 h-10 w-px bg-white/[0.08]" aria-hidden="true" />}
            <div className={i === 0 ? 'pr-6 md:pr-11' : 'px-6 md:px-11'}>
              {cifra.href ? (
                <Link
                  href={cifra.href}
                  className="block rounded-lg transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tx-accent-2)]"
                >
                  {contenido}
                </Link>
              ) : (
                contenido
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
