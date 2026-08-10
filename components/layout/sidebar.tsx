'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Sun,
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  BookOpen,
  Settings,
  Mail,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bot,
  Clock,
  MessagesSquare,
  Wallet,
  ShieldCheck,
} from 'lucide-react'
import { TryvexLogo } from '@/components/shared/tryvex-logo'

const MotionLink = motion.create(Link)

const primaryNav = [
  { href: '/hoy',                 label: 'Hoy',           icon: Sun,             count: null },
  { href: '/chat',                label: 'Chat',          icon: MessagesSquare,  count: null },
  { href: '/dashboard',           label: 'Dashboard',     icon: LayoutDashboard, count: null },
  { href: '/leads',               label: 'Leads',         icon: Users,           count: null },
  { href: '/clientes',            label: 'Clientes',      icon: Building2,       count: null },
  { href: '/proyectos',           label: 'Proyectos',     icon: FolderKanban,    count: null },
  { href: '/tareas',              label: 'Tareas',        icon: CheckSquare,     count: null },
  { href: '/reuniones',           label: 'Equipo',        icon: CalendarDays,    count: null },
  { href: '/cerebro',             label: 'Cerebro',       icon: BookOpen,        count: null },
  { href: '/vex',                 label: 'Vex',           icon: Bot,             count: null },
  { href: '/jornada',             label: 'Jornada',       icon: Clock,           count: null },
]

const systemNav = [
  { href: '/settings',            label: 'Configuración', icon: Settings,        count: null },
  { href: '/admin/invitaciones',  label: 'Invitaciones',  icon: Mail,            count: null },
]

// Secciones con permiso propio. Ocultarlas no es seguridad — de eso se encargan la RLS
// y las rutas —, es no ofrecer una puerta que se va a cerrar en la cara.
const finanzasNav = { href: '/finanzas',        label: 'Finanzas', icon: Wallet,      count: null }
const accesosNav  = { href: '/admin/permisos',  label: 'Accesos',  icon: ShieldCheck, count: null }

interface SidebarProps {
  onNavigate?: () => void
  forceExpand?: boolean
  /** Tiene 'ver_finanzas' (o 'gestionar_finanzas', que lo incluye). */
  puedeVerFinanzas?: boolean
  esSuperadmin?: boolean
}

function SidebarGroup({
  title,
  icon,
  children,
  defaultOpen = true,
  collapsed = false,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (collapsed) {
    return (
      <div className="w-full flex flex-col gap-1">
        {children}
      </div>
    )
  }

  return (
    <div className={`group ${open ? 'is-open' : ''} w-full`}>
      <button className="group__head cursor-pointer w-full" onClick={() => setOpen(!open)}>
        <span className="group__chevron">
          <ChevronDown size={14} className="transition-transform duration-200" />
        </span>
        <span className="group__title flex items-center">
          {icon}
          <span className="font-semibold text-[13px]">{title}</span>
        </span>
      </button>
      {open && <div className="group__body pl-1.5">{children}</div>}
    </div>
  )
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  count,
  onNavigate,
  collapsed = false,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  count: number | null
  onNavigate?: () => void
  collapsed?: boolean
}) {
  return (
    <MotionLink
      href={href}
      onClick={onNavigate}
      className={`nav-item w-full ${active ? 'is-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
      title={collapsed ? label : undefined}
      whileHover={collapsed ? { scale: 1.05 } : { x: 3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <span className="nav-item__icon">
        <Icon size={15} />
      </span>
      {!collapsed && <span className="nav-item__label">{label}</span>}
      {!collapsed && count != null && (
        <span className="nav-item__count">{count}</span>
      )}
    </MotionLink>
  )
}

export function Sidebar({
  onNavigate,
  forceExpand = false,
  puedeVerFinanzas = false,
  esSuperadmin = false,
}: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const itemsPrimarios = puedeVerFinanzas ? [...primaryNav, finanzasNav] : primaryNav
  const itemsSistema = esSuperadmin ? [...systemNav, accesosNav] : systemNav

  useEffect(() => {
    if (forceExpand) return
    const stored = localStorage.getItem('tryvex-sidebar-collapsed')
    if (stored !== null) {
      setIsCollapsed(stored === 'true')
    }
  }, [forceExpand])

  const toggleCollapse = () => {
    if (forceExpand) return
    const nextVal = !isCollapsed
    setIsCollapsed(nextVal)
    localStorage.setItem('tryvex-sidebar-collapsed', String(nextVal))
  }

  const collapsed = forceExpand ? false : isCollapsed

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div
      className={`flex flex-col h-full shrink-0 relative transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
      style={{
        background: 'var(--tx-bg-primary)',
        borderRight: '1px solid var(--border)'
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-[-80px] left-[-40px] w-[280px] h-[280px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--tx-accent-subtle) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Top Header - Tryvex Logo */}
      <div className={`flex items-center pt-6 pb-4 ${collapsed ? 'justify-center px-0' : 'justify-between px-[18px]'}`}>
        {collapsed ? (
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Link href="/dashboard">
              <TryvexLogo variant="icon" theme="dark" iconSize={20} />
            </Link>
          </motion.div>
        ) : (
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Link href="/dashboard">
              <TryvexLogo variant="full" theme="dark" iconSize={20} />
            </Link>
          </motion.div>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className={`flex-1 overflow-y-auto pt-2 pb-2 space-y-4 ${collapsed ? 'px-4' : 'px-3'}`}>
        {/* Inbox / Gestión Group */}
        <SidebarGroup
          title="Inbox / Gestión"
          icon={
            <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center bg-[var(--tx-accent)]/15 border border-[var(--tx-accent)]/20 text-[var(--tx-accent)] shrink-0 mr-1.5">
              <Mail size={12} />
            </span>
          }
          defaultOpen={true}
          collapsed={collapsed}
        >
          {itemsPrimarios.map(({ href, label, icon, count }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              count={count}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          ))}
        </SidebarGroup>

        {/* Equipos / Sistema Group */}
        <SidebarGroup
          title="Equipos / Sistema"
          icon={
            <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center bg-[var(--tx-accent)]/15 border border-[var(--tx-accent)]/20 text-[var(--tx-accent)] shrink-0 mr-1.5">
              <Settings size={12} />
            </span>
          }
          defaultOpen={true}
          collapsed={collapsed}
        >
          {itemsSistema.map(({ href, label, icon, count }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              count={count}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          ))}
        </SidebarGroup>
      </nav>

      {/* Collapse Toggle Footer */}
      {!forceExpand && (
        <div className="mt-auto p-3 border-t border-[rgba(255,255,255,0.06)] hidden md:flex justify-center">
          <motion.button
            onClick={toggleCollapse}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            className="w-8 h-8 rounded-full btn-rounded-gray flex items-center justify-center text-white"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </motion.button>
        </div>
      )}
    </div>
  )
}
