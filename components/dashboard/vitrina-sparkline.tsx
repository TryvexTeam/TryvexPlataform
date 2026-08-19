'use client'

interface VitrinaSparklineProps {
  /** Serie de valores en orden cronológico. Puede venir vacía. */
  datos: number[]
  /** Descripción equivalente para lectores de pantalla (es el aria-label). */
  descripcion: string
}

const ANCHO = 100
const ALTO = 32
const MARGEN = 2

/**
 * Mini línea/área SVG para un KPI (T-003 §5: "sparkline + número").
 *
 * Client porque el diseño lo reserva para refinamiento realtime (el mismo
 * patrón hidratar-props/refinar de `reloj-jornada`); hoy es presentacional.
 * SVG inline con tokens `var(--tx-*)` para heredar el acento dinámico del
 * tema — decisión D1 del PRP: cero librerías de gráficos.
 */
export function VitrinaSparkline({ datos, descripcion }: VitrinaSparklineProps) {
  const vacio = datos.length === 0

  let puntos = ''
  if (!vacio) {
    const min = Math.min(...datos)
    const max = Math.max(...datos)
    const rango = max - min
    const pasoX = datos.length > 1 ? ANCHO / (datos.length - 1) : 0
    const coords = datos.map((valor, i) => {
      // Serie plana (rango 0): línea al medio para que no desaparezca.
      const normalizado = rango === 0 ? 0.5 : (valor - min) / rango
      const y = ALTO - MARGEN - normalizado * (ALTO - MARGEN * 2)
      return `${(i * pasoX).toFixed(2)},${y.toFixed(2)}`
    })
    puntos = coords.join(' ')
  }

  return (
    <svg
      role="img"
      aria-label={descripcion}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
    >
      {vacio ? (
        // Sin datos todavía: línea plana tenue que reserva el alto de la
        // vitrina y comunica "no hay serie" sin romper el layout.
        <line
          x1="0"
          y1={ALTO / 2}
          x2={ANCHO}
          y2={ALTO / 2}
          stroke="var(--tx-border-strong)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <>
          {/* Área bajo la curva: el glow del acento ya trae su transparencia. */}
          <polygon
            points={`0,${ALTO} ${puntos} ${ANCHO},${ALTO}`}
            fill="var(--tx-accent-glow)"
          />
          <polyline
            points={puntos}
            fill="none"
            stroke="var(--tx-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}
