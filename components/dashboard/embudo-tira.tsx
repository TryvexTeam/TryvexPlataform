'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { CifraAnimada } from '@/components/dashboard/cifra-animada'
import type { Lead } from '@/lib/types/lead'

/**
 * Embudo de leads como una sola tira proporcional.
 *
 * Sustituye a cinco columnas con eje: el ancho de cada tramo ya dice la
 * proporción, y las cifras van debajo. Menos tinta para el mismo dato.
 *
 * Al posar el cursor sobre un tramo, los demás se apagan y ese revela su
 * porcentaje en el sitio, sin globo flotante. La comparación aparece cuando se
 * la pide y desaparece cuando no — que es justo lo que un tooltip clásico
 * hace mal: tapa el gráfico que estabas mirando.
 *
 * Son conteos por estado ACTUAL, no velocidad de conversión: no hay historial
 * de transiciones (gap G1 del T-001), así que una tasa por etapa sería
 * inventada.
 */

export interface TramoEmbudo {
  estado: Lead['estado']
  label: string
  count: number
}

/** Ancho mínimo de un tramo con leads: sin esto un 1 sobre 200 desaparece. */
const MINIMO_VISIBLE = 4

const COLOR_TRAMO: Record<string, string> = {
  sin_contactar: 'var(--tx-accent)',
  contactado: 'rgba(232,53,42,.5)',
  interesado: 'rgba(255,255,255,.26)',
  reunion_agendada: 'rgba(255,255,255,.17)',
  ganado: 'oklch(72% .17 145 / .7)',
}

export function EmbudoTira({ tramos }: { tramos: TramoEmbudo[] }) {
  const [activo, setActivo] = useState<string | null>(null)
  const sinMovimiento = useReducedMotion()
  const total = tramos.reduce((acc, t) => acc + t.count, 0)

  if (total === 0) {
    return (
      <p className="text-[13px] text-[var(--tx-ink-secondary)]">
        Todavía no hay leads en el embudo.
      </p>
    )
  }

  const conAncho = tramos
    .filter((tramo) => tramo.count > 0)
    .map((tramo) => ({
      ...tramo,
      ancho: Math.max(MINIMO_VISIBLE, (tramo.count / total) * 100),
      porcentaje: Math.round((tramo.count / total) * 100),
    }))

  return (
    <div className="flex gap-1" onMouseLeave={() => setActivo(null)}>
      {conAncho.map((tramo, i) => {
        const primero = i === 0
        const ultimo = i === conAncho.length - 1
        const apagado = activo !== null && activo !== tramo.estado
        const resaltado = activo === tramo.estado

        return (
          <Link
            key={tramo.estado}
            href={`/leads?estado=${tramo.estado}`}
            style={{ width: `${tramo.ancho}%` }}
            onMouseEnter={() => setActivo(tramo.estado)}
            onFocus={() => setActivo(tramo.estado)}
            onBlur={() => setActivo(null)}
            className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tx-accent-2)]"
          >
            <motion.div
              className="origin-bottom"
              // La barra se dibuja al entrar: crece desde la línea base en
              // vez de aparecer entera. Es `scaleY`, propiedad de
              // compositor — no provoca reflow por fotograma.
              initial={sinMovimiento ? false : { scaleY: 0 }}
              animate={{
                scaleY: 1,
                opacity: apagado ? 0.28 : 1,
              }}
              transition={{
                scaleY: {
                  type: 'spring',
                  stiffness: 220,
                  damping: 24,
                  delay: sinMovimiento ? 0 : i * 0.06,
                },
                opacity: { duration: 0.18 },
              }}
            >
              <motion.div
                className="h-11 md:h-[52px]"
                animate={{ scaleY: resaltado && !sinMovimiento ? 1.12 : 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 24 }}
                style={{
                  originY: 1,
                  background: COLOR_TRAMO[tramo.estado] ?? 'rgba(255,255,255,.17)',
                  borderRadius: `${primero ? '14px' : '4px'} ${ultimo ? '14px' : '4px'} ${ultimo ? '14px' : '4px'} ${primero ? '14px' : '4px'}`,
                }}
              />
            </motion.div>

            <motion.p
              className="mt-3.5 text-[22px] font-semibold leading-none tracking-[-0.04em] tabular-nums"
              animate={{ opacity: apagado ? 0.4 : 1 }}
              transition={{ duration: 0.18 }}
              style={{
                color: tramo.estado === 'ganado' ? 'oklch(72% .17 145)' : 'var(--tx-ink-primary)',
              }}
            >
              <CifraAnimada valor={tramo.count} />
            </motion.p>

            {/* El label cede su sitio al porcentaje mientras el tramo está
                activo: mismo renglón, sin empujar nada de lugar. */}
            <motion.p
              className="mt-2 truncate text-xs"
              animate={{ opacity: apagado ? 0.4 : 1 }}
              transition={{ duration: 0.18 }}
              style={{ color: resaltado ? 'var(--tx-ink-primary)' : 'var(--tx-ink-secondary)' }}
            >
              {resaltado ? `${tramo.porcentaje}% del total` : tramo.label}
            </motion.p>
          </Link>
        )
      })}
    </div>
  )
}
