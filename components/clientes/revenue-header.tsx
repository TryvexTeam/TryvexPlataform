'use client'

import { motion } from 'framer-motion'
import { TrendingUp, Users, AlertCircle, DollarSign } from 'lucide-react'
import type { Cliente } from '@/lib/types/cliente'
import { resumenFinanciero, type Venta } from '@/lib/types/proyecto'

interface RevenueHeaderProps {
  clientes: Cliente[]
  ventas: Venta[]
}

export function RevenueHeader({ clientes, ventas }: RevenueHeaderProps) {
  const activos = clientes.filter((c) => c.estado === 'activo')
  const mrr = activos.reduce((sum, c) => sum + (c.mantencion_mensual_usd ?? 0), 0)
  const arr = mrr * 12
  const pendientes = ventas.filter(
    (v) => v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado'
  )
  // Por cobrar agregado: saldo del valor inicial + pagos pendientes, por cliente
  const totalPendiente = clientes.reduce((sum, c) => {
    const ventasCliente = ventas.filter((v) => v.cliente_id === c.id)
    return sum + resumenFinanciero(ventasCliente, c.valor_inicial_usd).porCobrar
  }, 0)
  const hayAtrasados = ventas.some((v) => v.estado_pago === 'atrasado')

  const metrics = [
    {
      id: 'mrr',
      label: 'MRR',
      value: mrr > 0 ? `$${mrr.toLocaleString()}` : '—',
      sub: 'mensual recurrente',
      icon: TrendingUp,
      color: 'oklch(72% 0.17 145)',
      glow: 'oklch(72% 0.17 145 / 20%)',
    },
    {
      id: 'arr',
      label: 'ARR',
      value: arr > 0 ? `$${arr.toLocaleString()}` : '—',
      sub: 'anual estimado',
      icon: DollarSign,
      color: 'oklch(68% 0.18 230)',
      glow: 'oklch(68% 0.18 230 / 18%)',
    },
    {
      id: 'activos',
      label: 'Activos',
      value: activos.length.toString(),
      sub: `de ${clientes.length} total`,
      icon: Users,
      color: 'oklch(74% 0.17 55)',
      glow: 'oklch(74% 0.17 55 / 18%)',
    },
    {
      id: 'pendientes',
      label: hayAtrasados ? 'Por cobrar ⚠' : 'Por cobrar',
      value: totalPendiente > 0 ? `$${totalPendiente.toLocaleString()}` : '$0',
      sub: pendientes.length > 0
        ? `${pendientes.length} pago${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`
        : totalPendiente > 0 ? 'saldo inicial por cobrar' : 'sin pendientes',
      icon: AlertCircle,
      color: hayAtrasados ? 'oklch(72% 0.21 22)' : 'oklch(74% 0.008 240)',
      glow: hayAtrasados ? 'oklch(63% 0.21 22 / 20%)' : 'transparent',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
    >
      {metrics.map((m, i) => {
        const Icon = m.icon
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, delay: i * 0.05 }}
            className="relative overflow-hidden rounded-2xl p-4"
            style={{
              background: 'linear-gradient(180deg, oklch(12% 0.005 240) 0%, oklch(9% 0.003 240) 100%)',
              border: '1px solid oklch(100% 0 0 / 7%)',
              boxShadow: `inset 0 1px 0 oklch(100% 0 0 / 8%), 0 8px 24px oklch(0% 0 0 / 40%)`,
            }}
          >
            {/* Ambient glow behind icon */}
            <div
              className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle at 60% 30%, ${m.glow}, transparent 70%)`,
                filter: 'blur(18px)',
              }}
            />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--tx-ink-muted)' }}
                >
                  {m.label}
                </p>
                <p
                  className="text-[22px] font-bold tracking-tight leading-none tabular-nums"
                  style={{ color: 'var(--tx-ink-primary)' }}
                >
                  {m.value}
                </p>
                <p
                  className="text-[11px] mt-1.5 truncate"
                  style={{ color: 'var(--tx-ink-muted)' }}
                >
                  {m.sub}
                </p>
              </div>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: `${m.glow}`,
                  border: `1px solid ${m.color}30`,
                  color: m.color,
                }}
              >
                <Icon size={16} />
              </div>
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
