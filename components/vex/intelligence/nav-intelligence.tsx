'use client'

import { useEffect, useId, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

/**
 * La navegación de Intelligence, en dos niveles.
 *
 * Antes eran quince pestañas en cuatro cajas que se partían en dos filas
 * desiguales, todas con el mismo peso; en el celular, un selector nativo que
 * escondía dónde había algo que atender. Ahora:
 *
 *   1. Cuatro secciones, siempre en una fila, con un punto si adentro hay algo
 *      que requiere acción.
 *   2. Solo las pestañas de la sección elegida, deslizables con el pulgar.
 *
 * El color se reserva para lo que pide acción (esperando permiso, un cliente
 * esperando, un canal con problemas). Lo informativo (cuántas directivas o
 * demos hay vigentes) va en gris: si todo tiene color, nada destaca.
 */

export type Tono = 'accent' | 'warning' | 'error'

export interface PestanaNav<V extends string> {
  vista: V
  nombre: string
  contador?: number
  tono?: Tono
}

export interface SeccionNav<V extends string> {
  id: string
  titulo: string
  descripcion: string
  icono: LucideIcon
  pestanas: PestanaNav<V>[]
}

interface NavIntelligenceProps<V extends string> {
  secciones: SeccionNav<V>[]
  vista: V
  alCambiar: (vista: V) => void
}

const RESORTE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 } as const

/** Lo más grave que hay adentro de una sección, para su punto. */
function gravedad<V extends string>(s: SeccionNav<V>): Tono | null {
  const pendientes = s.pestanas.filter((p) => (p.contador ?? 0) > 0 && p.tono && p.tono !== 'accent')
  if (pendientes.some((p) => p.tono === 'error')) return 'error'
  return pendientes.length > 0 ? 'warning' : null
}

export function NavIntelligence<V extends string>({ secciones, vista, alCambiar }: NavIntelligenceProps<V>) {
  const id = useId()
  const sinMovimiento = useReducedMotion() ?? false
  const actual = secciones.find((s) => s.pestanas.some((p) => p.vista === vista)) ?? secciones[0]
  const transicion = sinMovimiento ? { duration: 0 } : RESORTE
  const fila = useRef<HTMLDivElement>(null)

  // En el celular la fila de pestañas se desliza: la activa tiene que quedar a
  // la vista (al entrar con ?vista=demos quedaba escondida a la derecha).
  // Se mueve solo la fila, nunca la página.
  useEffect(() => {
    const cont = fila.current
    const boton = cont?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!cont || !boton) return
    const b = boton.getBoundingClientRect()
    const c = cont.getBoundingClientRect()
    if (b.left < c.left || b.right > c.right) {
      cont.scrollBy({ left: b.left - c.left - 16, behavior: sinMovimiento ? 'auto' : 'smooth' })
    }
  }, [vista, sinMovimiento])

  return (
    <nav aria-label="Vistas de Intelligence" className="flex min-w-0 flex-col gap-2">
      {/* Nivel 1: secciones */}
      <div
        className="grid min-w-0 grid-cols-4 gap-1 rounded-2xl p-1"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
      >
        {secciones.map((s) => {
          const activa = s.id === actual.id
          const punto = gravedad(s)
          const Icono = s.icono
          return (
            <button
              key={s.id}
              type="button"
              aria-current={activa ? 'true' : undefined}
              aria-describedby={`${id}-${s.id}`}
              onClick={() => { if (!activa) alCambiar(s.pestanas[0].vista) }}
              className="relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:gap-2 sm:text-[13px]"
              style={{ color: activa ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)' }}
            >
              {activa && (
                <motion.span
                  layoutId={`${id}-seccion`}
                  transition={transicion}
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'var(--tx-surface-2)',
                    boxShadow: '0 0 0 1px var(--tx-border-strong) inset, 0 1px 2px rgb(0 0 0 / 0.25)',
                  }}
                />
              )}
              <span className="relative">
                <Icono size={15} aria-hidden="true" style={{ color: activa ? 'var(--tx-accent)' : undefined }} />
                {punto && (
                  <span
                    className="absolute -right-1 -top-1 size-2 rounded-full"
                    style={{ background: punto === 'error' ? 'var(--tx-error)' : 'var(--tx-warning)', boxShadow: '0 0 0 2px var(--tx-surface-1)' }}
                  />
                )}
              </span>
              <span className="relative max-w-full truncate">{s.titulo}</span>
              <span id={`${id}-${s.id}`} className="sr-only">
                {punto ? 'Hay algo que atender en esta sección.' : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* Nivel 2: las pestañas de la sección */}
      <div className="flex min-w-0 items-center gap-3">
        <div
          ref={fila}
          className="-mx-3 flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: 'linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 24px), transparent)' }}
        >
          {actual.pestanas.map((p) => {
            const activa = p.vista === vista
            return (
              <button
                key={p.vista}
                type="button"
                aria-current={activa ? 'page' : undefined}
                onClick={() => alCambiar(p.vista)}
                className="relative flex min-h-10 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors duration-150 hover:text-[var(--tx-ink-primary)] focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={{ color: activa ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)', fontWeight: activa ? 600 : 450 }}
              >
                {p.nombre}
                {p.contador ? <Contador valor={p.contador} tono={p.tono ?? 'accent'} /> : null}
                {activa && (
                  <motion.span
                    layoutId={`${id}-pestana`}
                    transition={transicion}
                    className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full"
                    style={{ background: 'var(--tx-accent)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <p className="hidden shrink-0 text-xs text-[var(--tx-ink-muted)] lg:block">{actual.descripcion}</p>
      </div>
      <div className="h-px w-full" style={{ background: 'var(--tx-border)' }} aria-hidden="true" />
    </nav>
  )
}

function Contador({ valor, tono }: { valor: number; tono: Tono }) {
  // Lo informativo en gris; el color solo para lo que pide acción. Cada fondo
  // lleva SU color de texto, para que se lea en los dos temas.
  const estilo =
    tono === 'accent'
      ? { background: 'var(--tx-surface-2)', color: 'var(--tx-ink-secondary)', boxShadow: '0 0 0 1px var(--tx-border-strong) inset' }
      : tono === 'warning'
        ? { background: 'var(--tx-warning)', color: '#14141b' }
        : { background: 'var(--tx-error)', color: '#fff' }
  return (
    <span className="min-w-[18px] rounded-full px-1.5 text-center text-[10.5px] font-semibold leading-[18px] tabular-nums" style={estilo}>
      {valor}
    </span>
  )
}
