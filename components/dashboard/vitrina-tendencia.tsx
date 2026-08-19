'use client'

import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { SerieDia } from '@/lib/types/dashboard'

/**
 * Tendencia de la semana como área.
 *
 * Reemplaza al sparkline de una línea: con el área bajo la curva el volumen se
 * lee sin mirar el eje, que es justo lo que se pregunta uno al abrir el panel
 * ("¿esta semana hubo más movimiento o menos?").
 *
 * Al pasar el cursor se marca el día bajo el puntero y su valor sustituye al
 * total en la cabecera — el dato aparece donde ya estabas mirando, en vez de
 * en un globo que tapa la curva.
 *
 * SVG inline, sin librería de gráficos: son siete puntos, y una dependencia de
 * 40 kB para esto sería cara. El trazo se dibuja con `pathLength`, que anima
 * sin recalcular la geometría en cada fotograma.
 */

interface VitrinaTendenciaProps {
  serie: SerieDia[]
  /** Se muestra cuando no hay ningún día señalado. */
  total: number
  etiqueta: string
}

const ANCHO = 300
const ALTO = 84
const MARGEN = 6

const DIA_CORTO = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'short' })

/** Etiqueta de un día 'YYYY-MM-DD' sin pasar por la zona del navegador. */
function nombreDia(dia: string): string {
  const texto = DIA_CORTO.format(new Date(`${dia}T12:00:00Z`))
  return texto.charAt(0).toUpperCase() + texto.slice(1, 3)
}

export function VitrinaTendencia({ serie, total, etiqueta }: VitrinaTendenciaProps) {
  const [activo, setActivo] = useState<number | null>(null)
  const sinMovimiento = useReducedMotion()
  const idGradiente = useId()

  if (serie.length === 0) {
    return <p className="text-[13px] text-[var(--tx-ink-secondary)]">Sin actividad esta semana.</p>
  }

  const max = Math.max(...serie.map((p) => p.total), 1)
  const paso = serie.length > 1 ? (ANCHO - MARGEN * 2) / (serie.length - 1) : 0

  const puntos = serie.map((punto, i) => ({
    ...punto,
    x: MARGEN + i * paso,
    y: ALTO - MARGEN - (punto.total / max) * (ALTO - MARGEN * 2),
  }))

  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const area = `${linea} L${puntos[puntos.length - 1]?.x ?? 0} ${ALTO} L${puntos[0]?.x ?? 0} ${ALTO} Z`

  const señalado = activo !== null ? puntos[activo] : undefined

  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--tx-ink-primary)]">
          {señalado ? señalado.total : total}
        </p>
        <p className="text-xs text-[var(--tx-ink-secondary)]">
          {señalado ? nombreDia(señalado.dia) : etiqueta}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="mt-4 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${etiqueta}: ${serie.map((p) => `${nombreDia(p.dia)} ${p.total}`).join(', ')}.`}
        onMouseLeave={() => setActivo(null)}
      >
        <defs>
          <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--tx-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--tx-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <motion.path
          d={area}
          fill={`url(#${idGradiente})`}
          initial={sinMovimiento ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        />

        <motion.path
          d={linea}
          fill="none"
          stroke="var(--tx-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={sinMovimiento ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />

        {señalado && (
          <>
            <line
              x1={señalado.x}
              y1={0}
              x2={señalado.x}
              y2={ALTO}
              stroke="rgba(255,255,255,.14)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={señalado.x}
              cy={señalado.y}
              r="3.5"
              fill="var(--tx-accent)"
              stroke="var(--tx-bg-primary)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* Zonas de captura: una franja por día, para no obligar a acertarle
            al punto exacto de la curva con el cursor. */}
        {puntos.map((punto, i) => (
          <rect
            key={punto.dia}
            x={punto.x - paso / 2}
            y={0}
            width={paso || ANCHO}
            height={ALTO}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
          />
        ))}
      </svg>

      <div className="mt-2.5 flex justify-between">
        {puntos.map((punto, i) => (
          <span
            key={punto.dia}
            className="text-[10px] tabular-nums transition-colors"
            style={{
              color: activo === i ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
            }}
          >
            {nombreDia(punto.dia)}
          </span>
        ))}
      </div>
    </div>
  )
}
