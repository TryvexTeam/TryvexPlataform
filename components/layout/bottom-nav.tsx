'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  CheckSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mobileNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/clientes', label: 'Clientes', icon: Building2 },
  { href: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/tareas', label: 'Tareas', icon: CheckSquare },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center px-2 pb-safe"
      style={{
        background: 'oklch(6% 0.003 240 / 85%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid var(--tx-border)',
      }}
      aria-label="Navegación principal"
    >
      {mobileNav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 relative"
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <motion.span
                layoutId="bottom-nav-indicator"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                style={{ background: 'var(--tx-accent)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <motion.div
              whileTap={{ scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <Icon
                size={20}
                className={cn(
                  'transition-colors',
                  active ? 'text-[var(--tx-accent-2)]' : 'text-[var(--tx-ink-muted)]'
                )}
              />
            </motion.div>
            <span
              className={cn(
                'text-[10px] font-medium leading-none transition-colors',
                active ? 'text-[var(--tx-accent-2)]' : 'text-[var(--tx-ink-muted)]'
              )}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
