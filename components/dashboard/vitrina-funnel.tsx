/**
 * Funnel de leads por estado — Server Component.
 *
 * Dibuja los conteos por estado ACTUAL, no velocidad de conversión: no hay
 * historial de transiciones (gap G1 del T-001), así que prometer una tasa por
 * etapa sería inventarla.
 *
 * Sin librería de gráficos: SVG inline. El ancho de cada tramo se calcula en el
 * servidor y se pinta con `width` fijo (no se anima); lo único que se mueve es
 * `opacity`, que la regla global de `prefers-reduced-motion` ya neutraliza.
 *
 * El color nunca es el único canal: cada fila lleva label y cifra visibles.
 */

export interface FunnelEstado {
  id: string
  label: string
  color: string
  count: number
}

const ALTO_FILA = 34
const ALTO_BARRA = 22
const ANCHO = 100 // viewBox en unidades relativas: el SVG escala al contenedor

export default function VitrinaFunnel({
  estados,
  titulo = 'Funnel de leads',
}: {
  estados: FunnelEstado[]
  titulo?: string
}) {
  const filas = estados ?? []
  const total = filas.reduce((acc, e) => acc + (e.count || 0), 0)
  const max = filas.reduce((acc, e) => Math.max(acc, e.count || 0), 0)

  const resumen = filas.length
    ? `${titulo}: ${filas.map((e) => `${e.count} ${e.label.toLowerCase()}`).join(', ')}.`
    : `${titulo}: sin leads registrados.`

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: 'linear-gradient(180deg, oklch(12% 0.005 240) 0%, oklch(9% 0.003 240) 100%)',
        border: '1px solid oklch(100% 0 0 / 7%)',
        boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 8%), 0 8px 24px oklch(0% 0 0 / 40%)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)]">
          {titulo}
        </h3>
        <p className="text-[22px] font-bold tracking-tight leading-none tabular-nums text-[var(--tx-ink-primary)]">
          {total}
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-[var(--tx-ink-secondary)]">Todavía no hay leads que mostrar.</p>
      ) : (
        <>
          <svg
            role="img"
            aria-label={resumen}
            viewBox={`0 0 ${ANCHO} ${filas.length * ALTO_FILA}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height: filas.length * ALTO_FILA, opacity: 1 }}
          >
            {filas.map((e, i) => {
              const ancho = max > 0 ? Math.max((e.count / max) * ANCHO, e.count > 0 ? 1 : 0) : 0
              const y = i * ALTO_FILA + (ALTO_FILA - ALTO_BARRA) / 2
              return (
                <g key={e.id}>
                  <rect
                    x={0}
                    y={y}
                    width={ANCHO}
                    height={ALTO_BARRA}
                    rx={4}
                    fill="oklch(100% 0 0 / 4%)"
                  />
                  {ancho > 0 && (
                    <rect
                      x={0}
                      y={y}
                      width={ancho}
                      height={ALTO_BARRA}
                      rx={4}
                      fill={e.color}
                      opacity={0.85}
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {/* Alternativa textual equivalente: el mismo dato sin depender del color. */}
          <ul className="mt-3 flex flex-col gap-1.5">
            {filas.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: e.color }}
                  />
                  <span className="truncate text-[var(--tx-ink-secondary)]">{e.label}</span>
                </span>
                <span className="tabular-nums font-medium text-[var(--tx-ink-primary)]">
                  {e.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
