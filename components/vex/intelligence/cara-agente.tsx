import type { EstadoAgente } from '@/lib/types/sala-agentes'

/**
 * La cara del agente: identidad y estado en la misma pieza.
 *
 * Un agente que sigue existiendo mañana necesita que lo reconozcan de reojo,
 * y su estado no merece un semáforo aparte: la cara ya lo dice. Trabajando
 * parpadea; esperando firma mira fijo con la boca recta; en reposo está
 * tranquilo; sin latido tiene los ojos en equis.
 *
 * Formas simples y ojos expresivos a propósito: así un equipo de cinco o de
 * veinte se distingue por color y gesto sin que ninguno parezca de otro mundo.
 *
 * El parpadeo respeta `prefers-reduced-motion` (ver `globals.css`).
 */

interface CaraAgenteProps {
  nombre: string
  /** Token de color del CRM, por ejemplo `var(--tx-blue)`. */
  color: string
  estado: EstadoAgente
  /** Lado del cuadrado, en píxeles. */
  tamano?: number
}

export function CaraAgente({ nombre, color, estado, tamano = 38 }: CaraAgenteProps) {
  const radio = Math.round(tamano * 0.3)
  const caido = estado === 'sin_latido'
  const parpadea = estado === 'trabajando'

  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${nombre}: ${etiquetaEstado(estado)}`}
      style={{ display: 'block', flex: 'none' }}
    >
      <rect width="40" height="40" rx={radio} fill={color} />

      {caido ? (
        <g stroke="#0d0d12" strokeWidth="2.2" strokeLinecap="round">
          <path d="M11 16 L17 20 M17 16 L11 20" />
          <path d="M23 16 L29 20 M29 16 L23 20" />
        </g>
      ) : (
        <g fill="#0d0d12" className={parpadea ? 'cara-parpadeo' : undefined}>
          <circle cx="14" cy={estado === 'en_reposo' ? 19 : 18} r="3.2" />
          <circle cx="26" cy={estado === 'en_reposo' ? 19 : 18} r="3.2" />
        </g>
      )}

      {/* La boca es el matiz: sonríe trabajando, recta esperando, plana caído. */}
      {estado === 'esperando_firma' ? (
        <rect x="14" y="26" width="12" height="2.4" rx="1.2" fill="#0d0d12" />
      ) : (
        <path
          d={caido ? 'M14 29 Q20 26 26 29' : 'M14 27 Q20 30.5 26 27'}
          stroke="#0d0d12"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

function etiquetaEstado(estado: EstadoAgente): string {
  if (estado === 'trabajando') return 'trabajando'
  if (estado === 'esperando_firma') return 'esperando tu firma'
  if (estado === 'en_reposo') return 'en reposo'
  return 'sin señales'
}
