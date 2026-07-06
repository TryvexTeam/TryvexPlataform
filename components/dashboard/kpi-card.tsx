'use client'

import { ArrowUpRight, Users, CheckSquare, FolderKanban, Building2 } from 'lucide-react'
import { useState } from 'react'

const iconMap = {
  Users,
  CheckSquare,
  FolderKanban,
  Building2,
} as const

export type KpiIconName = keyof typeof iconMap

interface KpiCardProps {
  label: string
  value: number
  href: string
  iconName: KpiIconName
  accent: string
  glow: string
}

export function KpiCard({ label, value, href, iconName, accent, glow }: KpiCardProps) {
  const [hovered, setHovered] = useState(false)
  const Icon = iconMap[iconName]

  return (
    <a
      href={href}
      className="relative rounded-2xl p-5 overflow-hidden block"
      style={{
        background: 'oklch(10% 0.004 240)',
        border: hovered ? `1px solid ${accent}40` : '1px solid var(--tx-border)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'border 150ms, transform 150ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute -top-4 -right-4 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: glow, filter: 'blur(24px)' }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl"
            style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
          >
            <Icon size={15} style={{ color: accent }} />
          </div>
          <ArrowUpRight
            size={14}
            style={{
              color: 'var(--tx-ink-muted)',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 150ms',
            }}
          />
        </div>

        <p
          className="text-[36px] font-bold leading-none tracking-[-0.04em] tabular-nums"
          style={{ color: 'var(--tx-ink-primary)' }}
        >
          {value}
        </p>
        <p className="mt-1.5 text-[12px] font-medium" style={{ color: 'var(--tx-ink-muted)' }}>
          {label}
        </p>
      </div>
    </a>
  )
}
