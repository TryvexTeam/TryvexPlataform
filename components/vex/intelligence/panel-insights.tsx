'use client'

import { Lightbulb, MessageCircle, Users } from 'lucide-react'
import type { Insight } from '@/lib/repos/intelligence-whatsapp'

/**
 * Lo que la gente pregunta, ordenado por cuántas veces lo pregunta.
 *
 * Forja muestra "insights" como una nube de temas. Acá la pregunta es más
 * concreta: ¿qué le falta saber al agente? Una duda que aparece doce veces y
 * que el agente no resuelve es un documento que falta en el Cerebro, o una
 * línea que falta en el guion. Por eso cada duda dice de dónde salió:
 *
 *  · de los clientes — el agente del VPS clasifica con IA los mensajes reales
 *    de WhatsApp y agrupa las preguntas repetidas;
 *  · del equipo — las dudas que el propio equipo le encoló a un agente.
 *
 * Nada de esto se escribe a mano: si la lista está vacía es porque no hubo
 * dudas en el período, o porque el agente de WhatsApp no respondió.
 */

interface PanelInsightsProps {
  insights: Insight[]
  /** Si el agente de WhatsApp respondió. Sin él faltan las dudas de clientes. */
  vpsDisponible: boolean
  dias: number
}

export function PanelInsights({ insights, vpsDisponible, dias }: PanelInsightsProps) {
  const maximo = insights[0]?.veces ?? 0
  const deClientes = insights.filter((i) => i.fuente === 'clientes').length

  return (
    <section aria-labelledby="titulo-insights" className="flex flex-col gap-4">
      <header>
        <h2 id="titulo-insights" className="text-base font-semibold text-[var(--tx-ink-primary)]">
          Insights
        </h2>
        <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
          Lo que más se pregunta en los últimos {dias} días. Una duda repetida es algo que falta en
          el Cerebro o en el guion del agente.
        </p>
      </header>

      {!vpsDisponible && (
        <p
          className="rounded-xl px-3 py-2 text-xs text-[var(--tx-ink-secondary)]"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-warning) 45%, transparent)',
            background: 'color-mix(in oklab, var(--tx-warning) 10%, transparent)',
          }}
        >
          El agente de WhatsApp no respondió: faltan las dudas de los clientes. Se muestran solo las
          del equipo.
        </p>
      )}

      {insights.length === 0 ? (
        <p
          className="flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-sm text-[var(--tx-ink-muted)]"
          style={{ border: '1px dashed var(--tx-border)' }}
        >
          <Lightbulb size={20} />
          {vpsDisponible
            ? 'No hubo dudas repetidas en el período. Cuando los clientes pregunten lo mismo varias veces, aparece acá.'
            : 'Sin dudas del equipo, y sin conexión con el agente de WhatsApp para traer las de los clientes.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {insights.map((insight, i) => {
            const ancho = maximo > 0 ? Math.max(4, (insight.veces / maximo) * 100) : 0
            const Icono = insight.fuente === 'clientes' ? MessageCircle : Users

            return (
              <li
                key={`${insight.fuente}-${i}`}
                className="flex flex-col gap-2 rounded-2xl p-3.5"
                style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
              >
                <div className="flex items-start gap-2.5">
                  <Icono size={14} className="mt-0.5 shrink-0 text-[var(--tx-ink-muted)]" />
                  <p className="min-w-0 flex-1 break-words text-sm text-[var(--tx-ink-primary)]">
                    {insight.texto}
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--tx-ink-secondary)]">
                    {insight.veces} {insight.veces === 1 ? 'vez' : 'veces'}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: 'var(--tx-surface-2)' }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
                    style={{
                      width: `${ancho}%`,
                      background: insight.fuente === 'clientes' ? 'var(--tx-accent)' : 'var(--tx-blue)',
                    }}
                  />
                </div>
                {insight.ejemplo && (
                  <p
                    className="rounded-lg px-2.5 py-1.5 text-xs italic text-[var(--tx-ink-secondary)]"
                    style={{ background: 'var(--tx-surface-2)' }}
                  >
                    &ldquo;{insight.ejemplo}&rdquo;
                  </p>
                )}
                <p className="text-[11px] text-[var(--tx-ink-muted)]">
                  {insight.fuente === 'clientes'
                    ? 'Lo preguntaron clientes por WhatsApp.'
                    : 'El equipo se lo preguntó a un agente.'}
                </p>
              </li>
            )
          })}
        </ol>
      )}

      {deClientes > 0 && (
        <p className="text-[11px] text-[var(--tx-ink-muted)]">
          Las dudas de clientes las agrupa con IA el agente de WhatsApp a partir de los mensajes
          reales: el título es su resumen, y el texto entre comillas es un mensaje real.
        </p>
      )}
    </section>
  )
}
