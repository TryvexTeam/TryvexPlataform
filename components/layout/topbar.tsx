'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useHasMounted } from '@/lib/hooks/use-has-mounted'
import { LogOut, Settings } from 'lucide-react'
import { toast } from '@/lib/toast'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ThemePanel } from '@/components/dashboard/theme-panel'
import { NotificacionesBell } from './notificaciones-bell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const routeLabels: Record<string, string> = {
  '/dashboard':           'Dashboard',
  '/leads':               'Leads',
  '/clientes':            'Clientes',
  '/proyectos':           'Proyectos',
  '/tareas':              'Tareas',
  '/reuniones':           'Reuniones',
  '/cerebro':             'Cerebro',
  '/settings':            'Configuración',
  '/admin/invitaciones':  'Invitaciones',
}

// Paginas de nivel raiz cuyo propio h1 ya dice el mismo nombre que este
// breadcrumb — "Leads" chico arriba y "Leads" grande justo abajo, apilados y
// sin razon. En una sub-ruta (ej. /cerebro/un-articulo) el breadcrumb sigue
// sirviendo para orientarse, asi que ahi se deja.
const RAIZ_CON_TITULO_PROPIO = new Set([
  '/clientes', '/proyectos', '/tareas', '/cerebro', '/settings',
])

function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  if (!segments.length) return null

  const rootPath = '/' + segments[0]
  if (segments.length === 1 && RAIZ_CON_TITULO_PROPIO.has(rootPath)) return null

  const rootLabel = routeLabels[rootPath]
  if (!rootLabel) return null

  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5">
      <span className="text-[16px] font-bold tracking-tight" style={{ color: 'var(--tx-ink-primary)' }}>{rootLabel}</span>
      {segments.length > 1 && (
        <>
          <span className="text-[13px]" style={{ color: 'var(--tx-ink-muted)' }}>/</span>
          <span className="text-[13px] truncate max-w-40" style={{ color: 'var(--tx-ink-secondary)' }}>
            {segments.slice(1).join(' / ')}
          </span>
        </>
      )}
    </nav>
  )
}

interface TopbarProps {
  nombre: string
  email: string
  avatarUrl: string | null
}

export function Topbar({ nombre, email, avatarUrl }: TopbarProps) {
  const router = useRouter()
  // Lazy initializer: lee localStorage antes del primer render en vez de
  // arrancar en 'online' y corregir en un efecto.
  const [status, setStatus] = useState<'online' | 'offline'>(() => {
    if (typeof window === 'undefined') return 'online'
    const saved = localStorage.getItem('tryvex-user-status') as 'online' | 'offline' | null
    return saved ?? 'online'
  })
  // El servidor siempre renderiza 'online' (sin acceso a localStorage); si el
  // valor guardado es 'offline', el primer render del cliente ya difiere y
  // React marca mismatch de hidratación en el punto de presencia. Se sigue
  // mostrando 'online' hasta que termine de hidratar.
  const mounted = useHasMounted()
  const statusMostrado = mounted ? status : 'online'

  function toggleStatus() {
    const newStatus = status === 'online' ? 'offline' : 'online'
    setStatus(newStatus)
    localStorage.setItem('tryvex-user-status', newStatus)
    toast.success(`Estado de presencia cambiado a: ${newStatus === 'online' ? 'Activo' : 'Inactivo'}`)
  }

  const initials = nombre
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Error al cerrar sesión')
      return
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      // pt-safe/px-safe: sin esto la barra queda bajo la Dynamic Island y no se
      // puede tocar. `h-12` pasa a ser alto MÍNIMO para que el inset la empuje.
      className="min-h-12 shrink-0 flex items-center justify-between px-4 pt-safe px-safe"
      style={{
        position: 'relative',
        zIndex: 50,
        background: 'oklch(6% 0.003 240 / 80%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--tx-border)',
      }}
    >
      {/* Left: breadcrumb.
          El botón de menú que abría el lateral en el teléfono se quitó: la barra
          inferior ya lleva los atajos y un menú con todas las secciones. Dos
          navegaciones para lo mismo obligan a adivinar cuál usar, y en una
          pantalla chica ese botón le comía espacio a la única cosa que la barra
          superior tiene que decir, que es dónde estoy parado. */}
      <div className="flex items-center gap-3 pl-2">
        <Breadcrumb />
      </div>

      {/* Right: user */}
      <div className="flex items-center gap-1">
        {/* Notificaciones */}
        <NotificacionesBell />

        {/* Theme panel */}
        <ThemePanel />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 pl-1 pr-1.5 h-7 rounded-lg transition-colors focus:outline-none"
            style={{ color: 'var(--tx-ink-primary)' }}
            aria-label={`Menú de usuario, ${nombre}`}
          >
            <div className="relative">
              <Avatar className="h-6 w-6">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback
                  className="text-[9px] font-bold"
                  style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: statusMostrado === 'online' ? '#22C55E' : '#9CA3AF',
                  border: '1.5px solid oklch(6% 0.003 240)',
                  boxShadow: statusMostrado === 'online' ? '0 0 6px rgba(34,197,94,0.8)' : 'none',
                }}
              />
            </div>
            <span className="hidden md:block text-[12px] font-medium max-w-28 truncate" style={{ color: 'var(--tx-ink-primary)' }}>
              {nombre.split(' ')[0]}
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--tx-border)' }}>
              <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--tx-ink-primary)' }}>{nombre}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--tx-ink-muted)' }}>{email}</p>
            </div>
            <div className="px-3 py-1.5" style={{ borderBottom: '1px solid var(--tx-border)' }}>
              <button
                onClick={toggleStatus}
                className="w-full flex items-center justify-between text-left text-[11px] font-semibold py-1 px-1.5 rounded hover:bg-[var(--tx-surface-2)] transition-colors"
                style={{ color: 'var(--tx-ink-secondary)' }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: status === 'online' ? '#22C55E' : '#9CA3AF',
                      boxShadow: status === 'online' ? '0 0 6px rgba(34,197,94,0.6)' : 'none'
                    }}
                  />
                  <span>Presencia: {status === 'online' ? 'Activo' : 'Inactivo'}</span>
                </span>
                <span className="text-[10px]" style={{ color: 'var(--tx-accent)' }}>
                  Cambiar
                </span>
              </button>
            </div>
            <div className="py-1">
              <DropdownMenuItem
                onClick={() => router.push('/settings')}
                className="cursor-pointer text-[13px] gap-2"
              >
                <Settings size={13} />
                Configuración
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <div className="py-1">
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-[13px] gap-2 text-red-600 focus:text-red-600"
              >
                <LogOut size={13} />
                Cerrar sesión
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
