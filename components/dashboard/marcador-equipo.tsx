'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CifraAnimada } from '@/components/dashboard/cifra-animada'
import { AvatarIntegrante } from '@/components/shared/avatar-integrante'
import type { MetricaEquipo } from '@/lib/types/dashboard'

/**
 * Marcador del equipo: horas, contactos y reuniones de la semana.
 *
 * Es un MARCADOR, no una tabla de posiciones. La diferencia está en lo que se
 * calla, y cada omisión es deliberada:
 *
 * - **Nadie aparece con un cero.** Solo figura quien tiene aporte. Publicar un
 *   cero al lado de un nombre no motiva a esa persona, la marca; y quien tuvo
 *   una semana mala por una razón real (permiso, terreno, licencia) queda
 *   expuesto sin contexto.
 * - **Sin puestos numerados.** No hay 1.º, 2.º ni último. El orden se ve en la
 *   barra, que informa igual sin colgarle una etiqueta de perdedor a nadie.
 * - **El total del equipo va primero y en grande.** La cifra que domina es la
 *   colectiva: primero vamos juntos, después se ve quién empujó más.
 * - **La ventana es la semana.** Un marcador anual condena al que arranca
 *   flojo; uno que se reinicia cada lunes deja siempre la remontada abierta.
 * - **Tu barra se marca, no se premia.** El acento sirve para encontrarte de
 *   un vistazo, no para decir que ganaste.
 *
 * La barra es relativa al mayor aporte, no al total: con cuatro personas las
 * barras contra el total serían todas cortas e indistinguibles.
 */

interface MarcadorEquipoProps {
  metricas: MetricaEquipo[]
}

function formatear(valor: number, decimales: number): string {
  return decimales > 0 ? valor.toFixed(decimales) : String(Math.round(valor))
}

export function MarcadorEquipo({ metricas }: MarcadorEquipoProps) {
  const [seleccionada, setSeleccionada] = useState(metricas[0]?.id ?? 'horas')
  const sinMovimiento = useReducedMotion()

  const activa = metricas.find((m) => m.id === seleccionada) ?? metricas[0]
  if (!activa) return null

  const decimales = activa.decimales ?? 0
  const mayor = activa.aportes[0]?.valor ?? 0

  return (
    <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.038] p-5 md:p-6">
      {/* Selector de métrica. Cambiar de métrica reordena la lista con layout
          animado, así se ve QUIÉN se mueve entre una y otra: alguien puede
          llevar pocas horas y muchas reuniones, y eso vale más que un ranking
          único que aplana los perfiles. */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {metricas.map((metrica) => {
          const esActiva = metrica.id === seleccionada
          return (
            <button
              key={metrica.id}
              type="button"
              onClick={() => setSeleccionada(metrica.id)}
              aria-pressed={esActiva}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors ${
                esActiva
                  ? 'border-white bg-white text-[var(--tx-bg-primary)]'
                  : 'border-white/[0.09] text-[var(--tx-ink-secondary)] hover:text-[var(--tx-ink-primary)]'
              }`}
            >
              {metrica.label}
            </button>
          )
        })}
      </div>

      {/* El total del equipo manda: es la cifra grande, antes que cualquier
          nombre propio. */}
      <div className="mt-6 flex items-baseline gap-2.5">
        <p className="text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--tx-ink-primary)]">
          <CifraAnimada
            key={activa.id}
            valor={activa.total}
            formato={(n) => formatear(n, decimales)}
          />
        </p>
        {/* "Esta semana" solo donde es verdad: los proyectos en curso son una
            foto del momento, no trabajo acumulado desde el lunes. */}
        <p className="text-[13px] text-[var(--tx-ink-secondary)]">
          {activa.unidad} · todo el equipo{activa.semanal === false ? ' ahora mismo' : ' esta semana'}
        </p>
      </div>

      {activa.aportes.length === 0 ? (
        <p className="mt-6 text-[13px] text-[var(--tx-ink-secondary)]">
          Todavía no hay actividad registrada esta semana.
        </p>
      ) : (
        <ul className="mt-7 flex flex-col gap-4">
          {activa.aportes.map((aporte, i) => {
            const ancho = mayor === 0 ? 0 : (aporte.valor / mayor) * 100
            return (
              <motion.li
                key={aporte.integranteId}
                // `layout` reordena con transición cuando se cambia de métrica:
                // el movimiento explica que la lista se reordenó, en vez de
                // sustituir los nombres de golpe.
                layout={!sinMovimiento}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="flex items-center gap-3.5"
              >
                <AvatarIntegrante
                  nombre={aporte.nombre}
                  avatarUrl={aporte.avatarUrl}
                  color={aporte.color}
                  size={36}
                  destacado={aporte.esMio}
                />

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <p
                      className={`truncate text-[13px] ${
                        aporte.esMio
                          ? 'font-medium text-[var(--tx-ink-primary)]'
                          : 'text-[var(--tx-ink-secondary)]'
                      }`}
                    >
                      {aporte.nombre}
                      {aporte.esMio && (
                        <span className="ml-2 text-[11px] text-[var(--tx-ink-muted)]">tú</span>
                      )}
                    </p>
                    <p className="shrink-0 text-[13px] tabular-nums text-[var(--tx-ink-primary)]">
                      {formatear(aporte.valor, decimales)}
                    </p>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <motion.div
                      className="h-1.5 rounded-full"
                      initial={sinMovimiento ? false : { width: 0 }}
                      animate={{ width: `${ancho}%` }}
                      transition={{
                        type: 'spring',
                        stiffness: 180,
                        damping: 24,
                        delay: sinMovimiento ? 0 : i * 0.07,
                      }}
                      style={{
                        background: aporte.esMio ? 'var(--tx-accent)' : 'rgba(255,255,255,.28)',
                      }}
                    />
                  </div>
                </div>
              </motion.li>
            )
          })}
        </ul>
      )}

      <p className="mt-6 text-[11px] text-[var(--tx-ink-muted)]">
        {activa.semanal === false
          ? 'Proyectos sin entregar ni cerrar. Solo aparece quien tiene alguno.'
          : 'Se reinicia cada semana. Solo aparece quien registró actividad.'}
      </p>
    </div>
  )
}
