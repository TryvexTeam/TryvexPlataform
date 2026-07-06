'use client'

import { Flame, CalendarClock, UserPlus, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

/* Íconos resueltos en el cliente — los Server Components pasan solo el nombre
   (las funciones no son serializables a través del boundary RSC) */
const ICONS: Record<string, LucideIcon> = {
  flame: Flame,
  'calendar-clock': CalendarClock,
  'user-plus': UserPlus,
}

export interface HoyItem {
  id: string
  label: string
  sublabel: string
  href: string
  badge?: {
    text: string
    color: string
  }
  metaRight?: string
}

interface HoySeccionProps {
  titulo: string
  icon: keyof typeof ICONS
  items: HoyItem[]
  emptyMessage: string
  emptyEmoji: string
  emptyAction: {
    label: string
    href: string
  }
}

export function HoySeccion({
  titulo,
  icon,
  items,
  emptyMessage,
  emptyEmoji,
  emptyAction,
}: HoySeccionProps) {
  const Icon = ICONS[icon] ?? Flame
  return (
    <section
      className="hub-card"
      style={{
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        padding: '0',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'color-mix(in oklab, var(--tx-accent) 15%, transparent)',
              border: '1px solid color-mix(in oklab, var(--tx-accent) 25%, transparent)',
              color: 'var(--tx-accent)',
              flexShrink: 0,
            }}
          >
            <Icon size={15} />
          </span>
          <h2
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--tx-ink-primary)',
              margin: 0,
            }}
          >
            {titulo}
          </h2>
        </div>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--tx-ink-muted)',
            backgroundColor: 'rgba(255,255,255,0.06)',
            padding: '2px 10px',
            borderRadius: '100px',
            minWidth: '24px',
            textAlign: 'center',
          }}
        >
          {items.length}
        </span>
      </div>

      {/* Body */}
      {items.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 20px',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '28px', lineHeight: 1 }}>{emptyEmoji}</span>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--tx-ink-muted)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {emptyMessage}
          </p>
          <Link
            href={emptyAction.href}
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              color: 'var(--tx-accent-fg)',
              background: 'var(--tx-accent)',
              padding: '6px 14px',
              borderRadius: '10px',
              textDecoration: 'none',
              transition: 'opacity 0.15s',
              boxShadow: '0 8px 22px var(--tx-accent-glow)',
            }}
          >
            {emptyAction.label}
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item, i) => (
            <li
              key={item.id}
              style={{
                borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <Link
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '12px 20px',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {/* Left side */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--tx-ink-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--tx-ink-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.sublabel}
                  </span>
                </div>

                {/* Right side: badge + meta */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexShrink: 0,
                  }}
                >
                  {item.badge && (
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--tx-accent-fg)',
                        backgroundColor: item.badge.color,
                        padding: '2px 9px',
                        borderRadius: '100px',
                        lineHeight: '18px',
                      }}
                    >
                      {item.badge.text}
                    </span>
                  )}
                  {item.metaRight && (
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--tx-ink-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.metaRight}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
