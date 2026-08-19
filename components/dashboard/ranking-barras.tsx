/**
 * Ranking horizontal de integrantes — Server Component.
 *
 * Barras en div puro (no SVG): no hay nada que dibujar más allá de un ancho, y
 * el ancho se calcula en el servidor, así que no se anima. Lo único que se
 * mueve sería `opacity` heredada del contenedor.
 *
 * Cada barra lleva label y cifra visibles: la longitud no es el único canal.
 */

export interface RankingFila {
  label: string
  valor: number
  max: number
  color?: string
}

export default function RankingBarras({
  filas,
  titulo,
}: {
  filas: RankingFila[]
  titulo: string
}) {
  const lista = filas ?? []
  const resumen = lista.length
    ? `${titulo}: ${lista.map((f) => `${f.label}, ${f.valor}`).join('; ')}.`
    : `${titulo}: sin datos.`

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)] mb-3">
        {titulo}
      </h3>

      {lista.length === 0 ? (
        <p className="text-sm text-[var(--tx-ink-secondary)]">Todavía no hay actividad que rankear.</p>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label={resumen}>
          {lista.map((f, i) => {
            const max = f.max > 0 ? f.max : 0
            const pct = max > 0 ? Math.min(Math.max((f.valor / max) * 100, 0), 100) : 0
            const color = f.color ?? 'var(--tx-accent)'
            return (
              <li key={`${f.label}-${i}`} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--tx-ink-secondary)]">{f.label}</span>
                  <span className="tabular-nums font-medium text-[var(--tx-ink-primary)]">
                    {f.valor}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full"
                  style={{ background: 'oklch(100% 0 0 / 6%)' }}
                >
                  <div
                    aria-hidden
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color, opacity: 0.9 }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
