'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { CifraAnimada } from '@/components/dashboard/cifra-animada'
import { VitrinaTendencia } from '@/components/dashboard/vitrina-tendencia'
import type { BentoPersonalDatos } from '@/lib/types/dashboard'

/**
 * Analíticas de la semana: tendencia de interacciones, carga por prioridad y
 * horas contra la meta.
 *
 * Tres tarjetas de igual ancho en vez de un bento de celdas dispares: cuando
 * los datos son comparables entre sí, darles el mismo tamaño es lo que permite
 * compararlos. La jerarquía la pone la sección entera, no cada celda peleando
 * por espacio.
 */

interface PanelAnaliticaProps {
  datos: BentoPersonalDatos
  /** Meta semanal de horas, para la barra de progreso. */
  metaHoras: number
}

const PRIORIDADES = [
  { id: 'alta', label: 'Alta', color: 'var(--tx-error)' },
  { id: 'media', label: 'Media', color: 'var(--tx-warning)' },
  { id: 'baja', label: 'Baja', color: 'var(--tx-success)' },
] as const

function Tarjeta({
  titulo,
  children,
  indice,
}: {
  titulo: string
  children: React.ReactNode
  indice: number
}) {
  const sinMovimiento = useReducedMotion()
  return (
    <motion.div
      className="rounded-[28px] border border-white/[0.07] bg-white/[0.038] p-5"
      initial={sinMovimiento ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: indice * 0.06 }}
    >
      <h3 className="mb-4 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--tx-ink-muted)]">
        {titulo}
      </h3>
      {children}
    </motion.div>
  )
}

export function PanelAnalitica({ datos, metaHoras }: PanelAnaliticaProps) {
  const sinMovimiento = useReducedMotion()

  const totalCarga = datos.carga ? datos.carga.alta + datos.carga.media + datos.carga.baja : 0
  const horas = datos.horas
  const avanceHoras = horas === null ? 0 : Math.min(100, (horas / metaHoras) * 100)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Tarjeta titulo="Interacciones · 7 días" indice={0}>
        {datos.interacciones ? (
          <VitrinaTendencia
            serie={datos.interacciones.serie}
            total={datos.interacciones.total}
            etiqueta="esta semana"
          />
        ) : (
          <p className="text-[13px] text-[var(--tx-ink-secondary)]">
            Las interacciones no respondieron.
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Carga por prioridad" indice={1}>
        {datos.carga ? (
          <>
            <div className="flex items-baseline gap-2.5">
              <p className="text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--tx-ink-primary)]">
                <CifraAnimada valor={totalCarga} />
              </p>
              <p className="text-xs text-[var(--tx-ink-secondary)]">tareas activas</p>
            </div>

            <div className="mt-6 flex flex-col gap-3.5">
              {PRIORIDADES.map((prioridad, i) => {
                const valor = datos.carga![prioridad.id]
                const ancho = totalCarga === 0 ? 0 : (valor / totalCarga) * 100
                return (
                  <div key={prioridad.id}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-xs text-[var(--tx-ink-secondary)]">
                        {prioridad.label}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--tx-ink-primary)]">
                        {valor}
                      </span>
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
                          delay: sinMovimiento ? 0 : 0.2 + i * 0.08,
                        }}
                        style={{ background: prioridad.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-[var(--tx-ink-secondary)]">
            La carga de trabajo no respondió.
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Horas esta semana" indice={2}>
        {horas === null ? (
          <p className="text-[13px] text-[var(--tx-ink-secondary)]">
            Las horas no respondieron.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2.5">
              <p className="text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--tx-ink-primary)]">
                <CifraAnimada valor={horas} formato={(n) => n.toFixed(1)} />
                <span className="ml-1 text-[18px] font-medium text-[var(--tx-ink-muted)]">h</span>
              </p>
              <p className="text-xs text-[var(--tx-ink-secondary)]">de {metaHoras} h</p>
            </div>

            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div
                className="h-1.5 rounded-full"
                initial={sinMovimiento ? false : { width: 0 }}
                animate={{ width: `${avanceHoras}%` }}
                transition={{
                  type: 'spring',
                  stiffness: 180,
                  damping: 24,
                  delay: sinMovimiento ? 0 : 0.2,
                }}
                style={{ background: 'var(--tx-accent)' }}
              />
            </div>

            <p className="mt-3 text-xs text-[var(--tx-ink-secondary)]">
              {/* La meta es referencia, no tope: pasarse no es un error que
                  haya que señalar en rojo. */}
              {horas >= metaHoras
                ? 'Semana completa'
                : `Faltan ${(metaHoras - horas).toFixed(1)} h para la referencia`}
            </p>
          </>
        )}
      </Tarjeta>
    </div>
  )
}
