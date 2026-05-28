'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  BookOpen,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/clientes', label: 'Clientes', icon: Building2 },
  { href: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/tareas', label: 'Tareas', icon: CheckSquare },
  { href: '/reuniones', label: 'Reuniones', icon: CalendarDays },
  { href: '/cerebro', label: 'Cerebro', icon: BookOpen },
  { href: '/settings', label: 'Configuración', icon: Settings },
]

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-white w-60 py-6 px-3">
      <div className="px-3 mb-8">
        <span className="text-lg font-bold tracking-tight">Tryvex</span>
        <span className="text-xs text-neutral-400 block">Sistema interno</span>
      </div>
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
