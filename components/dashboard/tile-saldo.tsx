/**
 * Saldo neto del mes — Server Component.
 *
 * NO consulta permisos: el llamador lo renderiza sólo si `puede(perfil,
 * 'ver_finanzas')`. Este componente únicamente pinta el número que recibe.
 *
 * El signo va escrito ("Superávit" / "Déficit" + `+`/`−`), no sólo teñido:
 * quien no distingue verde de rojo lee lo mismo.
 */

import { formatearCLP } from '@/lib/types/finanzas'

function formatearMonto(monto: number, moneda?: string): string {
  if (!moneda || moneda === 'CLP') return formatearCLP(monto)
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(monto)
}

export default function TileSaldo({
  saldo,
  mesAnterior,
  moneda = 'CLP',
}: {
  saldo: number
  mesAnterior?: number
  moneda?: string
}) {
  const valor = Number.isFinite(saldo) ? saldo : 0
  const positivo = valor > 0
  const negativo = valor < 0
  const color = positivo ? 'var(--tx-success)' : negativo ? 'var(--tx-error)' : 'var(--tx-ink-primary)'
  const signo = positivo ? '+' : negativo ? '−' : ''
  const etiqueta = positivo ? 'Superávit' : negativo ? 'Déficit' : 'En cero'

  const hayPrevio = typeof mesAnterior === 'number' && Number.isFinite(mesAnterior)
  const delta = hayPrevio ? valor - (mesAnterior as number) : null
  const deltaColor =
    delta === null || delta === 0
      ? 'var(--tx-ink-muted)'
      : delta > 0
        ? 'var(--tx-success)'
        : 'var(--tx-error)'
  const deltaTexto =
    delta === null
      ? null
      : delta === 0
        ? 'Igual que el mes anterior'
        : `${delta > 0 ? '+' : '−'}${formatearMonto(Math.abs(delta), moneda)} vs. mes anterior`

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: 'linear-gradient(180deg, oklch(12% 0.005 240) 0%, oklch(9% 0.003 240) 100%)',
        border: '1px solid oklch(100% 0 0 / 7%)',
        boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 8%), 0 8px 24px oklch(0% 0 0 / 40%)',
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[var(--tx-ink-muted)]">
        Saldo neto del mes
      </p>

      <p
        className="text-[22px] font-bold tracking-tight leading-none tabular-nums"
        style={{ color }}
      >
        {signo}
        {formatearMonto(Math.abs(valor), moneda)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            background: 'color-mix(in oklab, currentColor 15%, transparent)',
            border: '1px solid color-mix(in oklab, currentColor 30%, transparent)',
            color,
          }}
        >
          {etiqueta}
        </span>
        {deltaTexto && (
          <span className="text-[12px] tabular-nums" style={{ color: deltaColor }}>
            {deltaTexto}
          </span>
        )}
      </div>
    </section>
  )
}
