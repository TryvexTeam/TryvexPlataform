'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const shimmer = {
  animate: { backgroundPosition: ['200% 0', '-200% 0'] },
  transition: { duration: 1.5, repeat: Infinity, ease: 'linear' as const },
}

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <motion.div
      {...shimmer}
      className={cn(
        'rounded-md bg-gradient-to-r from-[var(--tx-surface-1)] via-white/70 to-[var(--tx-surface-1)] bg-[length:200%_100%]',
        className
      )}
    />
  )
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-white border border-[var(--tx-border)] rounded-lg p-4 space-y-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

export function SkeletonKanbanColumn({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col min-w-[272px] w-[272px] shrink-0">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-8 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 rounded-lg p-2 bg-[var(--tx-surface-1)]">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
