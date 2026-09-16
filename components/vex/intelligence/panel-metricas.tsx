'use client'

import { TrendingUp } from 'lucide-react'

export interface MetricasSala {
  /** Conversaciones cerradas sin que interviniera una persona. */
  resueltasSinHumano: number
  /** Total de conversaciones del período. */
  conversaciones: number
  /** Cuántas terminaron con un humano tomando el control. */
  traspasos: number
  /** Leads creados o calificados por los agentes. */
  leadsCaptados: number
  /** Reuniones agendadas por los agentes. */
  reuniones: number
  /** Mediana de segundos hasta la primera respuesta. */
  segundosPrimeraRespuesta: number
  /** Veces que un freno evitó una respuesta inventada. */
  frenosAplicados: number
  /** Serie de 14 días: conversaciones por día. */
  serieConversaciones: number[]
  /** Serie de 14 días: cuántas de esas se resolvieron solas. */
  serieResueltas: number[]
  /** Los motivos más frecuentes de traspaso a un humano. */
  motivosTraspaso: { motivo: string; veces: number }[]
}

interface PanelMetricasProps {
  metricas: MetricasSala
  /** Cuántos días cubre el período, para rotularlo. */
  dias?: number
}

const enteros = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

export function PanelMetricas({ metricas, dias = 14 }: PanelMetricasProps) {
  const porcentaje = metricas.conversaciones > 0
    ? Math.round((metricas.resueltasSinHumano / metricas.conversaciones) * 100)
    : 0
  const motivos = [...metricas.motivosTraspaso].sort((a, b) => b.veces - a.veces)
  const motivoMaximo = motivos[0]?.veces ?? 0

  return (
    <section aria-labelledby="titulo-metricas" className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <div className="flex-1">
          <h2 id="titulo-metricas" className="text-base font-semibold text-[var(--tx-ink-primary)]">
            Métricas de la Sala
          </h2>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            El trabajo que los agentes resuelven y dónde todavía necesitan una persona.
          </p>
        </div>
        <TrendingUp size={18} className="mt-0.5 text-[var(--tx-accent)]" aria-hidden="true" />
      </header>

      <article
        className="rounded-2xl p-5"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      >
        <p className="text-xs text-[var(--tx-ink-muted)]">Resuelto sin humano</p>
        <p
          className="mt-2 text-[40px] font-semibold leading-none tabular-nums"
          style={{ color: porcentaje < 70 ? 'var(--tx-warning)' : 'var(--tx-success)' }}
        >
          {porcentaje}%
        </p>
        <p className="mt-2 text-sm tabular-nums text-[var(--tx-ink-secondary)]">
          {enteros.format(metricas.resueltasSinHumano)} de {enteros.format(metricas.conversaciones)} conversaciones
        </p>
      </article>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CifraSecundaria
          etiqueta="Leads captados"
          valor={metricas.leadsCaptados}
          contexto="Personas que avanzaron gracias a un agente."
        />
        <CifraSecundaria
          etiqueta="Reuniones agendadas"
          valor={metricas.reuniones}
          contexto="Oportunidades que llegaron al calendario."
        />
        <CifraSecundaria
          etiqueta="Traspasos a humano"
          valor={metricas.traspasos}
          contexto="Conversaciones que necesitaron tomar el control."
        />
        <CifraSecundaria
          etiqueta="Frenos aplicados"
          valor={metricas.frenosAplicados}
          contexto="Veces que se evitó una respuesta inventada."
        />
      </dl>

      <article
        className="rounded-2xl p-4"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--tx-ink-primary)]">Tiempo de primera respuesta</h3>
          <span className="text-xs text-[var(--tx-ink-muted)]">mediana</span>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--tx-ink-primary)]">
          {formatearSegundos(metricas.segundosPrimeraRespuesta)}
        </p>
      </article>

      <article
        className="rounded-2xl p-4"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--tx-ink-primary)]">Conversaciones por día</h3>
          <span className="text-xs text-[var(--tx-ink-muted)]">últimos {dias} días</span>
        </div>
        <GraficoConversaciones
          conversaciones={metricas.serieConversaciones}
          resueltas={metricas.serieResueltas}
          dias={dias}
        />
      </article>

      <article
        className="rounded-2xl p-4"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      >
        <h3 className="text-sm font-semibold text-[var(--tx-ink-primary)]">
          Por qué tuvo que entrar una persona
        </h3>
        {motivos.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-3">
            {motivos.map((motivo) => {
              const ancho = motivoMaximo > 0 ? (motivo.veces / motivoMaximo) * 100 : 0
              return (
                <li key={motivo.motivo} className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-[var(--tx-ink-secondary)]">{motivo.motivo}</span>
                    <span className="shrink-0 tabular-nums text-[var(--tx-ink-muted)]">
                      {enteros.format(motivo.veces)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--tx-surface-2)' }}>
                    <div
                      className="motion-safe:[transition:width_320ms_ease] h-full rounded-full bg-[var(--tx-accent)]"
                      style={{ width: `${ancho}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-3 text-xs text-[var(--tx-ink-muted)]">Sin traspasos en este período.</p>
        )}
      </article>
    </section>
  )
}

function CifraSecundaria({
  etiqueta,
  valor,
  contexto,
}: {
  etiqueta: string
  valor: number
  contexto: string
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <dt className="text-xs text-[var(--tx-ink-muted)]">{etiqueta}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--tx-ink-primary)]">
        {enteros.format(valor)}
      </dd>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--tx-ink-muted)]">{contexto}</p>
    </div>
  )
}

function GraficoConversaciones({
  conversaciones,
  resueltas,
  dias,
}: {
  conversaciones: number[]
  resueltas: number[]
  dias: number
}) {
  const cantidad = Math.max(conversaciones.length, resueltas.length, 1)
  const maximo = Math.max(0, ...conversaciones, ...resueltas, 1)
  const anchoBarra = 7
  const anchoPaso = 100 / cantidad

  return (
    <svg
      viewBox="0 0 100 110"
      width="100%"
      height="90"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Conversaciones de los últimos ${dias} días, con resueltas destacadas`}
      className="mt-3 overflow-visible"
    >
      {Array.from({ length: cantidad }, (_, indice) => {
        const conversacionesDia = Math.max(0, conversaciones[indice] ?? 0)
        const resueltasDia = Math.min(conversacionesDia, Math.max(0, resueltas[indice] ?? 0))
        const alturaTotal = (conversacionesDia / maximo) * 82
        const alturaResueltas = (resueltasDia / maximo) * 82
        const x = indice * anchoPaso + (anchoPaso - anchoBarra) / 2
        const yTotal = 88 - alturaTotal
        const yResueltas = 88 - alturaResueltas

        return (
          <g key={indice}>
            <rect
              x={x}
              y={yTotal}
              width={anchoBarra}
              height={alturaTotal}
              rx="1"
              fill="var(--tx-surface-3)"
            />
            <rect
              x={x}
              y={yResueltas}
              width={anchoBarra}
              height={alturaResueltas}
              rx="1"
              fill="var(--tx-success)"
            />
          </g>
        )
      })}
      <text x="0" y="105" fill="var(--tx-ink-muted)" fontSize="4" textAnchor="start">
        hace {dias} días
      </text>
      <text x="100" y="105" fill="var(--tx-ink-muted)" fontSize="4" textAnchor="end">
        hoy
      </text>
    </svg>
  )
}

function formatearSegundos(segundos: number): string {
  const valor = Math.max(0, Math.round(segundos))
  const minutos = Math.floor(valor / 60)
  const segundosRestantes = valor % 60
  if (minutos === 0) return `${segundosRestantes} s`
  return `${minutos} min ${segundosRestantes} s`
}
