'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { VitrinaSparkline } from '@/components/dashboard/vitrina-sparkline'

interface KpiNumeroProps {
  label: string
  value: number | string
  tono?: 'neutral' | 'alerta' | 'ok'
  href?: string
  sparkline?: number[]
  /**
   * Icono por props (lucide-react), como la caja de icono de la tarjeta Kpi
   * de finanzas. Es el componente, no el elemento: aquí se pinta a 16px.
   */
  Icono?: LucideIcon
}

const TONO_COLOR: Record<NonNullable<KpiNumeroProps['tono']>, string> = {
  neutral: 'var(--tx-ink-primary)',
  alerta: 'var(--tx-warning)',
  ok: 'var(--tx-success)',
}

/**
 * Tarjeta de KPI: réplica EXACTA de la tarjeta Kpi de
 * `components/finanzas/finanzas-workspace.tsx` (T-012 §1) — el panel debe
 * verse como una pantalla más del CRM, no como un diseño invitado.
 *
 * 'use client' por la animación de entrada (framer-motion); los datos
 * siguen llegando agregados por props desde el Server Component.
 */
export function KpiNumero({ label, value, tono = 'neutral', href, sparkline, Icono }: KpiNumeroProps) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[var(--tx-ink-muted)]">
            {label}
          </p>
          <p
            className="text-[22px] font-bold tracking-tight leading-none tabular-nums"
            style={{ color: TONO_COLOR[tono] }}
          >
            {value}
          </p>
        </div>
        {Icono && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: `${TONO_COLOR[tono]}20`,
              border: `1px solid ${TONO_COLOR[tono]}40`,
              color: TONO_COLOR[tono],
            }}
          >
            <Icono size={16} aria-hidden />
          </div>
        )}
      </div>
      {sparkline && (
        <VitrinaSparkline
          datos={sparkline}
          descripcion={`${label}: serie de los últimos ${sparkline.length} días, valores ${sparkline.join(', ')}.`}
        />
      )}
    </>
  )

  if (href) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <Link
          href={href}
          className="relative block overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.038] p-5 transition-colors hover:border-white/[0.13] hover:bg-white/[0.06]"
        >
          {contenido}
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.038] p-5"
    >
      {contenido}
    </motion.div>
  )
}
