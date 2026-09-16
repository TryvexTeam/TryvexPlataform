'use client'

import { AlertTriangle, Check } from 'lucide-react'
import type { EntradaHilo, Paso } from '@/lib/types/sala-agentes'

/**
 * Una entrada de un hilo: lo que se dijo, lo que se hizo, o cómo terminó.
 *
 * Vive aparte porque el mismo hilo se muestra en dos lugares — el espacio del
 * agente y la pantalla de conversaciones — y una copia por pantalla termina
 * divergiendo: la de un lado gana una mejora y la del otro se queda vieja.
 *
 * Las tres clases de entrada tienen forma distinta a propósito:
 *   · mensaje   — burbuja; del cliente a la izquierda, del equipo a la derecha.
 *   · pasos     — lista compacta y monocroma: es registro, no conversación.
 *   · veredicto — bloque con borde de color: es el cierre, y se busca con la vista.
 */

interface EntradaDelHiloProps {
  entrada: EntradaHilo
}

export function EntradaDelHilo({ entrada }: EntradaDelHiloProps) {
  if (entrada.clase === 'mensaje') {
    // El cliente escribe desde fuera: va a la izquierda. El equipo y el agente,
    // a la derecha, porque son "nosotros" — pero con colores distintos, que no
    // es lo mismo que conteste Vex a que conteste Vicente.
    const desdeFuera = entrada.de === 'cliente'
    const esHumano = entrada.de === 'persona'

    return (
      <div
        className="max-w-[78%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap"
        style={{
          alignSelf: desdeFuera ? 'flex-start' : 'flex-end',
          background: desdeFuera
            ? 'var(--tx-surface-2)'
            : esHumano
              ? 'color-mix(in oklab, var(--tx-blue) 18%, transparent)'
              : 'var(--tx-accent-subtle)',
          border: `1px solid ${
            desdeFuera
              ? 'var(--tx-border)'
              : esHumano
                ? 'color-mix(in oklab, var(--tx-blue) 45%, transparent)'
                : 'color-mix(in oklab, var(--tx-accent) 40%, transparent)'
          }`,
        }}
      >
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
          {entrada.autor} · {entrada.hora}
          {esHumano && ' · humano'}
        </span>
        <span className="text-[var(--tx-ink-primary)]">{entrada.texto}</span>
      </div>
    )
  }

  if (entrada.clase === 'pasos') {
    return (
      <div
        className="max-w-[78%] self-start overflow-hidden rounded-xl"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-0)' }}
      >
        {entrada.pasos.map((paso) => (
          <PasoDelAgente key={paso.orden} paso={paso} />
        ))}
      </div>
    )
  }

  const pasa = entrada.resultado === 'pasa'
  return (
    <div
      className="flex max-w-[78%] flex-col gap-1.5 self-start rounded-xl p-3"
      style={{
        border: `1px solid ${pasa ? 'var(--tx-success)' : 'var(--tx-error)'}`,
        background: 'var(--tx-surface-2)',
      }}
    >
      <p
        className="flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: pasa ? 'var(--tx-success)' : 'var(--tx-error)' }}
      >
        {pasa ? <Check size={13} /> : <AlertTriangle size={13} />}
        {pasa ? 'Entregado con evidencia' : 'No pasó el veredicto'}
      </p>
      <p className="text-[11px] text-[var(--tx-ink-secondary)]">{entrada.detalle}</p>
      <div className="flex flex-wrap gap-1.5">
        {entrada.evidencias.map((ev) => (
          <span
            key={`${ev.tipo}-${ev.resumen}`}
            className="rounded-md px-1.5 py-0.5 text-[10px] text-[var(--tx-ink-secondary)]"
            style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
          >
            {ev.tipo} · {ev.resumen}
          </span>
        ))}
      </div>
    </div>
  )
}

function PasoDelAgente({ paso }: { paso: Paso }) {
  const color =
    paso.resultado === 'ok'
      ? 'var(--tx-success)'
      : paso.resultado === 'aviso'
        ? 'var(--tx-warning)'
        : 'var(--tx-error)'

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-1.5 text-[11px]"
      style={{ borderBottom: '1px solid var(--tx-border)' }}
    >
      <span
        className="grid size-4 place-items-center rounded text-[9px] text-white"
        style={{ background: color }}
        aria-hidden="true"
      >
        {paso.resultado === 'aviso' ? '!' : paso.orden}
      </span>
      <span className="min-w-0 flex-1 text-[var(--tx-ink-secondary)]">{paso.texto}</span>
      <span className="text-[10px] tabular-nums text-[var(--tx-ink-muted)]">{paso.duracion}</span>
    </div>
  )
}
