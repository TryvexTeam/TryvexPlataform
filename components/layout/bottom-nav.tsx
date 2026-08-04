'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Brain,
  Bot,
  Calendar,
  CheckSquare,
  Clock,
  Building2,
  FolderKanban,
  LayoutDashboard,
  MailPlus,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Los cuatro atajos de siempre + "Más".
 *
 * Antes había cinco secciones fijas y las otras ocho solo vivían en el menú
 * lateral, que en un teléfono no se abre: desde el celular la mitad de la app
 * era inalcanzable. El quinto lugar pasa a ser la puerta a todo lo demás.
 */
const ATAJOS = [
  { href: '/hoy', label: 'Hoy', icon: Sun },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/tareas', label: 'Tareas', icon: CheckSquare },
  { href: '/leads', label: 'Leads', icon: Users },
]

const TODAS = [
  { grupo: 'Gestión', items: [
    { href: '/hoy', label: 'Hoy', icon: Sun },
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leads', label: 'Leads', icon: Users },
    { href: '/clientes', label: 'Clientes', icon: Building2 },
    { href: '/proyectos', label: 'Proyectos', icon: FolderKanban },
    { href: '/tareas', label: 'Tareas', icon: CheckSquare },
  ]},
  { grupo: 'Equipo', items: [
    { href: '/reuniones', label: 'Equipo', icon: Calendar },
    { href: '/cerebro', label: 'Cerebro', icon: Brain },
    { href: '/vex', label: 'Vex', icon: Bot },
    { href: '/jornada', label: 'Jornada', icon: Clock },
  ]},
  { grupo: 'Sistema', items: [
    { href: '/settings', label: 'Configuración', icon: Settings },
    { href: '/admin/invitaciones', label: 'Invitaciones', icon: MailPlus },
  ]},
]

export function BottomNav() {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)

  // Navegar cierra el panel. Sin esto queda tapando la pantalla a la que se fue.
  useEffect(() => setAbierto(false), [pathname])

  // Con el panel abierto, el fondo no debe scrollear detrás.
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [abierto])

  const enSeccion = (href: string) => pathname === href || pathname.startsWith(href + '/')
  // Si la sección actual no es ninguno de los atajos, "Más" queda marcado: así
  // se ve dónde se está aunque la sección no tenga su propio botón.
  const enOtra = !ATAJOS.some((a) => enSeccion(a.href))

  return (
    <>
      {abierto && <PanelSecciones alCerrar={() => setAbierto(false)} enSeccion={enSeccion} />}

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
        {ATAJOS.map(({ href, label, icon: Icon }) => (
          <Ranura key={href} activo={enSeccion(href)} href={href} label={label} Icon={Icon} />
        ))}

        <Ranura
          activo={enOtra}
          label="Más"
          Icon={abierto ? X : MoreHorizontal}
          onClick={() => setAbierto((v) => !v)}
          expandido={abierto}
        />
      </nav>
    </>
  )
}

interface RanuraProps {
  activo: boolean
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  href?: string
  onClick?: () => void
  expandido?: boolean
}

function Ranura({ activo, label, Icon, href, onClick, expandido }: RanuraProps) {
  const contenido = (
    <>
      {activo && (
        <motion.span
          layoutId="bottom-nav-indicator"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
          style={{ background: 'var(--tx-accent)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <motion.div whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
        <Icon
          size={20}
          className={cn('transition-colors', activo ? 'text-[var(--tx-accent-2)]' : 'text-[var(--tx-ink-muted)]')}
        />
      </motion.div>
      <span
        className={cn(
          'text-[10px] font-medium leading-none transition-colors',
          activo ? 'text-[var(--tx-accent-2)]' : 'text-[var(--tx-ink-muted)]',
        )}
      >
        {label}
      </span>
    </>
  )

  // 56px de alto: el mínimo cómodo para un pulgar, según las guías de ambas
  // plataformas. Con menos, el botón existe pero cuesta acertarle.
  const clases = 'flex-1 flex flex-col items-center justify-center gap-1 min-h-14 py-2 relative'

  if (href) {
    return (
      <Link href={href} className={clases} aria-current={activo ? 'page' : undefined}>
        {contenido}
      </Link>
    )
  }

  return (
    <button onClick={onClick} className={clases} aria-expanded={expandido} aria-label={label}>
      {contenido}
    </button>
  )
}

/** Todas las secciones, en una hoja que sube desde abajo. */
function PanelSecciones({
  alCerrar,
  enSeccion,
}: {
  alCerrar: () => void
  enSeccion: (href: string) => boolean
}) {
  return (
    <div className="md:hidden fixed inset-0 z-40">
      <button
        onClick={alCerrar}
        aria-label="Cerrar menú"
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        // El padding de abajo deja libre la barra de navegación y la zona de
        // gestos del teléfono: sin eso, el último ítem queda debajo de ambas.
        className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl px-3 pt-3"
        style={{
          background: 'oklch(9% 0.004 240)',
          borderTop: '1px solid var(--tx-border)',
          paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />

        {TODAS.map(({ grupo, items }) => (
          <div key={grupo} className="mb-4 last:mb-0">
            <h2 className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-ink-muted)]">
              {grupo}
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map(({ href, label, icon: Icon }) => {
                const activo = enSeccion(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={alCerrar}
                    aria-current={activo ? 'page' : undefined}
                    className="flex items-center gap-2.5 rounded-xl px-3 min-h-12"
                    style={{
                      background: activo ? 'var(--tx-accent-subtle)' : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <Icon
                      size={18}
                      className={activo ? 'text-[var(--tx-accent-2)]' : 'text-[var(--tx-ink-muted)]'}
                    />
                    <span className="text-[13px] text-[var(--tx-ink-primary)]">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
