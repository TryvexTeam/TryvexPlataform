'use client'

import { Badge } from '@/components/ui/badge'
import type { AgenteSala } from '@/lib/types/sala-agentes'

export interface CostoAgente {
  agenteId: string
  nombre: string
  color: string
  gastoHoyCLP: number
  gastoMesCLP: number
  encargosMes: number
  tokensMes: number
  /** Gasto de los últimos 14 días, el más viejo primero. Para el gráfico. */
  serie: number[]
}

interface PanelCostosProps {
  costos: CostoAgente[]
  agentes: AgenteSala[]
  /**
   * Dólar observado usado para convertir. Los proveedores cobran en dólares;
   * decir de dónde sale el número en pesos es parte de que sea creíble.
   */
  tasaCLP?: { valor: number; fecha: string } | null
  /**
   * Agentes activos que nunca reportaron su consumo. No es que no gasten: es
   * que no se sabe. Mostrarlos en cero sería afirmar algo falso.
   */
  sinReporte?: string[]
  /** Un problema que impide mostrar los costos, explicado. */
  aviso?: string
}

const pesos = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

const enteros = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

export function PanelCostos({ costos, agentes, tasaCLP, sinReporte = [], aviso }: PanelCostosProps) {
  const gastoHoy = costos.reduce((total, costo) => total + costo.gastoHoyCLP, 0)
  const gastoMes = costos.reduce((total, costo) => total + costo.gastoMesCLP, 0)
  const hoy = new Date()
  const diasTranscurridos = hoy.getDate()
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const proyeccionMes = diasTranscurridos > 0 ? (gastoMes / diasTranscurridos) * diasDelMes : 0
  const costosOrdenados = [...costos].sort((a, b) => b.gastoMesCLP - a.gastoMesCLP)
  const gastoMaximo = costosOrdenados[0]?.gastoMesCLP ?? 0
  const agentesPorId = new Map(agentes.map((agente) => [agente.id, agente]))

  return (
    <section aria-labelledby="titulo-costos" className="flex flex-col gap-4">
      <header>
        <h2 id="titulo-costos" className="text-base font-semibold text-[var(--tx-ink-primary)]">
          Costos de los agentes
        </h2>
        <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
          Cuánto cuesta el trabajo del equipo y dónde se concentra.
          {tasaCLP && (
            <>
              {' '}
              Convertido a pesos con el dólar observado del {tasaCLP.fecha} (
              {pesos.format(tasaCLP.valor)}).
            </>
          )}
        </p>
      </header>

      {aviso && (
        <p
          className="rounded-xl px-3 py-2 text-xs text-[var(--tx-ink-secondary)]"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-warning) 45%, transparent)',
            background: 'color-mix(in oklab, var(--tx-warning) 10%, transparent)',
          }}
        >
          {aviso}
        </p>
      )}

      {sinReporte.length > 0 && (
        <p className="text-xs text-[var(--tx-ink-muted)]">
          <b className="text-[var(--tx-ink-secondary)]">Sin reporte de consumo:</b>{' '}
          {sinReporte.join(', ')}. Su gasto no aparece porque no lo informan, no porque sea cero.
          Se reporta con <code>POST /api/agentes/consumo</code>.
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-3">
        <CifraGrande etiqueta="Gasto de hoy" valor={gastoHoy} />
        <CifraGrande etiqueta="Gasto del mes" valor={gastoMes} />
        <CifraGrande etiqueta="Proyección de cierre" valor={proyeccionMes} />
      </dl>

      <div
        className="overflow-hidden rounded-2xl"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      >
        <ul className="divide-y divide-[var(--tx-border)]">
          {costosOrdenados.map((costo, indice) => {
            const agente = agentesPorId.get(costo.agenteId)
            const nombre = agente?.nombre ?? costo.nombre
            const color = agente?.color ?? costo.color
            const costoMedio = costo.encargosMes > 0 ? costo.gastoMesCLP / costo.encargosMes : 0
            const porcentaje = gastoMaximo > 0 ? (costo.gastoMesCLP / gastoMaximo) * 100 : 0

            return (
              <li key={costo.agenteId} className="grid gap-3 p-4 lg:grid-cols-[minmax(150px,1fr)_minmax(170px,1fr)_minmax(190px,1fr)_76px] lg:items-center">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium text-[var(--tx-ink-primary)]">
                    {nombre}
                  </span>
                  {indice === 0 && costosOrdenados.length > 0 && (
                    <Badge
                      variant="outline"
                      style={{
                        background: 'color-mix(in oklab, var(--tx-warning) 16%, transparent)',
                        borderColor: 'color-mix(in oklab, var(--tx-warning) 42%, transparent)',
                        color: 'var(--tx-warning)',
                      }}
                    >
                      el más caro
                    </Badge>
                  )}
                </div>

                <div className="tabular-nums">
                  <p className="text-lg font-semibold text-[var(--tx-ink-primary)]">
                    {formatearPesos(costo.gastoMesCLP)}
                  </p>
                  <p className="text-xs text-[var(--tx-ink-muted)]">
                    {formatearPesos(costo.gastoHoyCLP)} hoy
                  </p>
                </div>

                <div className="text-xs tabular-nums text-[var(--tx-ink-muted)]">
                  <p>{enteros.format(costo.encargosMes)} encargos este mes</p>
                  <p>{formatearPesos(costoMedio)} por encargo</p>
                  <p>{enteros.format(costo.tokensMes)} tokens</p>
                </div>

                <Chispa serie={costo.serie} color={color} nombre={nombre} />

                <div
                  className="h-1.5 overflow-hidden rounded-full lg:col-span-4"
                  style={{ background: 'var(--tx-surface-2)' }}
                  aria-hidden="true"
                >
                  <div
                    className="motion-safe:[transition:width_320ms_ease] h-full rounded-full"
                    style={{ width: `${porcentaje}%`, background: color }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <p
        className="rounded-xl p-3 text-xs leading-relaxed text-[var(--tx-ink-muted)]"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      >
        El costo de WhatsApp oficial se cobra aparte, por mensaje: esto es solo lo que piensan los agentes.
      </p>
    </section>
  )
}

function CifraGrande({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <dt className="text-xs text-[var(--tx-ink-muted)]">{etiqueta}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--tx-ink-primary)]">
        {formatearPesos(valor)}
      </dd>
    </div>
  )
}

function Chispa({ serie, color, nombre }: { serie: number[]; color: string; nombre: string }) {
  const maximo = Math.max(0, ...serie)
  const divisorX = Math.max(1, serie.length - 1)
  const puntos = serie
    .map((valor, indice) => {
      const x = (indice / divisorX) * 60
      const y = maximo > 0 ? 18 - (Math.max(0, valor) / maximo) * 18 : 18
      return `${redondear(x)},${redondear(y)}`
    })
    .join(' ')

  return (
    <svg
      width="60"
      height="18"
      viewBox="0 0 60 18"
      role="img"
      aria-label={`Gasto de ${nombre} durante los últimos 14 días`}
      className="overflow-visible"
    >
      <polyline
        points={puntos}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function formatearPesos(valor: number): string {
  return pesos.format(Math.round(valor))
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}
