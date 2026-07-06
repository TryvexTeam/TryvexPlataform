'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { StatusBadge } from './status-badge'
import type { AnyEstado } from './status-badge'

export type { AnyEstado }

interface EntityCardProps {
  title: string
  subtitle?: string
  meta?: string
  status?: AnyEstado
  statusLabel?: string
  actions?: React.ReactNode
  footer?: React.ReactNode
  onClick?: () => void
  className?: string
  children?: React.ReactNode
}

export function EntityCard({
  title,
  subtitle,
  meta,
  status,
  statusLabel,
  actions,
  footer,
  onClick,
  className,
  children,
}: EntityCardProps) {
  return (
    <motion.div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      whileHover={onClick ? { y: -1 } : {}}
      whileTap={onClick ? { scale: 0.99 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group rounded-xl p-4',
        'transition-all duration-150',
        onClick && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--tx-accent)] focus-visible:outline-none',
        className
      )}
      style={{
        background: 'oklch(10% 0.004 240)',
        border: '1px solid var(--tx-border)',
      }}
    >
      {/* Fila 1: Identidad + badge */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--tx-ink-primary)] tracking-tight leading-snug truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-[12px] text-[var(--tx-ink-muted)] mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {status && <StatusBadge status={status} label={statusLabel} className="shrink-0 mt-0.5" />}
      </div>

      {/* Metadata */}
      {meta && (
        <p className="text-[12px] text-[var(--tx-ink-muted)] mt-2">{meta}</p>
      )}

      {/* Slot libre */}
      {children && <div className="mt-3">{children}</div>}

      {/* Footer con acciones — visible en hover */}
      {(actions || footer) && (
        <div className={cn(
          'flex items-center justify-between mt-3 pt-3 border-t border-[var(--tx-border)]',
          actions && 'opacity-0 group-hover:opacity-100 transition-opacity duration-150'
        )}>
          <div className="flex items-center gap-2 text-[12px] text-[var(--tx-ink-muted)]">
            {footer}
          </div>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
    </motion.div>
  )
}
