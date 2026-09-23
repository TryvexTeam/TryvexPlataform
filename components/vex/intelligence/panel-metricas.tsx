'use client'

import { TrendingUp } from 'lucide-react'

export interface MetricasSala {
  /** Conversaciones cerradas sin que interviniera una persona. */
  resueltasSinHumano: number
  /** Total de conversaciones del período. */
  conversaciones: number
  /** Cuántas terminaron con un humano tomando el control. */
  traspasos: number
  /** Leads creados o calificados por los agentes. `null` = el agente no lo reportó. */
  leadsCaptados: number | null
  /** Reuniones agendadas por los agentes. `null` = todavía no se distingue quién agendó. */
  reuniones: number | null
  /** Mediana de segundos hasta la primera respuesta. `null` = no hubo mensajes. */
  segundosPrimeraRespuesta: number | null
  /** Veces que un freno evitó una respuesta inventada. `null` = el agente aún no los registra. */
  frenosAplicados: number | null
  /** Conversaciones que el bot respondió. */
  atendidasPorBot?: number
  /** El último mensaje es del cliente y nadie le contestó. Lo que hay que mirar hoy. */
  sinRespuesta?: number
  /** Mensajes del equipo que el cliente nunca respondió. Se cuentan aparte a propósito. */
  prospeccionSinRespuesta?: number
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
        {metricas.prospeccionSinRespuesta !== undefined && metricas.prospeccionSinRespuesta > 0 && (
          <p className="mt-1 text-[11px] text-[var(--tx-ink-muted)]">
            Aparte: {enteros.format(metricas.prospeccionSinRespuesta)} contactos que el equipo escribió y
            nunca respondieron. No son conversaciones: nadie del otro lado habló.
          </p>
        )}
      </article>

      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        <CifraSecundaria
          etiqueta="Clientes sin respuesta"
          valor={metricas.sinRespuesta ?? null}
          contexto="Escribieron y nadie les contestó. Es lo primero que hay que mirar."
          alerta={(metricas.sinRespuesta ?? 0) > 0}
        />
        <CifraSecundaria
          etiqueta="Leads captados"
          valor={metricas.leadsCaptados}
          contexto="Personas que avanzaron gracias a un agente."
          sinMedir="El agente de WhatsApp no respondió al pedirle este dato."
        />
        <CifraSecundaria
          etiqueta="Reuniones agendadas"
          valor={metricas.reuniones}
          contexto="Oportunidades que un agente llevó al calendario."
          sinMedir="Todavía no se distingue qué reunión agendó un agente."
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
          sinMedir="El agente frena, pero todavía no deja constancia de cuándo."
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
          {metricas.segundosPrimeraRespuesta === null
            ? 'sin datos'
            : formatearSegundos(metricas.segundosPrimeraRespuesta)}
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
  sinMedir,
  alerta = false,
}: {
  etiqueta: string
  /** `null` es "no se mide", que es distinto de cero. Mostrar 0 sería mentir. */
  valor: number | null
  contexto: string
  /** Por qué no hay dato, cuando no lo hay. */
  sinMedir?: string
  alerta?: boolean
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <dt className="text-xs text-[var(--tx-ink-muted)]">{etiqueta}</dt>
      <dd
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{
          color:
            valor === null
              ? 'var(--tx-ink-muted)'
              : alerta
                ? 'var(--tx-error)'
                : 'var(--tx-ink-primary)',
        }}
      >
        {valor === null ? 'sin medir' : enteros.format(valor)}
      </dd>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--tx-ink-muted)]">
        {valor === null && sinMedir ? sinMedir : contexto}
      </p>
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
  const anchoPaso = 100 / cantidad
  // La barra ocupa el 60 % de su casilla: con un ancho fijo, en pantallas anchas
  // las barras se tocaban y en las angostas quedaban como hilos.
  const anchoBarra = anchoPaso * 0.6
  const total = conversaciones.reduce((t, n) => t + Math.max(0, n), 0)

  return (
    <div className="mt-3">
      {/*
        El SVG se estira para llenar el ancho (`preserveAspectRatio="none"`), y
        eso deforma cualquier texto que tenga adentro. Por eso las etiquetas van
        afuera, en HTML, donde no se estiran.
      */}
      <svg
        viewBox="0 0 100 90"
        width="100%"
        height="90"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Conversaciones de los últimos ${dias} días: ${total} en total, con las resueltas por el agente en verde`}
      >
        <line x1="0" y1="88" x2="100" y2="88" stroke="var(--tx-border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: cantidad }, (_, indice) => {
          const conversacionesDia = Math.max(0, conversaciones[indice] ?? 0)
          const resueltasDia = Math.min(conversacionesDia, Math.max(0, resueltas[indice] ?? 0))
          const alturaTotal = (conversacionesDia / maximo) * 84
          const alturaResueltas = (resueltasDia / maximo) * 84
          const x = indice * anchoPaso + (anchoPaso - anchoBarra) / 2

          return (
            <g key={indice}>
              <rect x={x} y={88 - alturaTotal} width={anchoBarra} height={alturaTotal} fill="var(--tx-surface-3)" />
              <rect x={x} y={88 - alturaResueltas} width={anchoBarra} height={alturaResueltas} fill="var(--tx-success)" />
            </g>
          )
        })}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] text-[var(--tx-ink-muted)]">
        <span>hace {dias} días</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm" style={{ background: 'var(--tx-success)' }} />
            resueltas por el agente
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm" style={{ background: 'var(--tx-surface-3)' }} />
            necesitaron a alguien
          </span>
        </span>
        <span>hoy</span>
      </div>
    </div>
  )
}

function formatearSegundos(segundos: number): string {
  const valor = Math.max(0, Math.round(segundos))
  const minutos = Math.floor(valor / 60)
  const segundosRestantes = valor % 60
  if (minutos === 0) return `${segundosRestantes} s`
  return `${minutos} min ${segundosRestantes} s`
}
