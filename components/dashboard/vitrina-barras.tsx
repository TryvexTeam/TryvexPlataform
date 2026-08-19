interface FilaBarra {
  label: string
  valor: number
  max: number
  color?: string
}

interface VitrinaBarrasProps {
  filas: FilaBarra[]
}

/**
 * Barras horizontales genéricas (carga por prioridad, rankings, horas —
 * T-003 §6). Server Component: recibe los datos ya agregados.
 *
 * Cada barra lleva su label y su número VISIBLES: el color nunca es el
 * único canal de información (T-003 §11). Se renderiza como `<ul>` con
 * texto real — el lector de pantalla escucha lo mismo que se ve, sin
 * necesitar una tabla oculta aparte.
 */
export function VitrinaBarras({ filas }: VitrinaBarrasProps) {
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((fila) => {
        // max <= 0 (sin datos): la barra queda en 0 y el número manda.
        const llenado = fila.max > 0 ? Math.min(100, (fila.valor / fila.max) * 100) : 0
        return (
          <li key={fila.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium" style={{ color: 'var(--tx-ink-secondary)' }}>
                {fila.label}
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--tx-ink-primary)' }}>
                {fila.valor}
              </span>
            </div>
            {/* Decorativa: la información ya está en el texto de arriba. */}
            <div
              aria-hidden="true"
              className="h-2 w-full rounded-full"
              style={{ background: 'var(--tx-surface-2)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${llenado}%`, background: fila.color ?? 'var(--tx-accent)' }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
