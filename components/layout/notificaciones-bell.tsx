'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, UserPlus, FolderKanban, CalendarClock, DollarSign, ListChecks, CalendarCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Nombre único por montaje: supabase-js cachea los canales por nombre y
// removeChannel es asíncrono, así que un remonte reusaba uno ya suscrito y
// agregarle callbacks lanzaba un error que tumbaba la página.
let contadorCanales = 0

interface Notif {
  id: string
  tipo: string
  titulo: string
  cuerpo: string | null
  link: string | null
  leida: boolean
  created_at: string
}

const ICONOS: Record<string, React.ElementType> = {
  nuevo_cliente: UserPlus,
  proyecto_asignado: FolderKanban,
  entrega_proxima: CalendarClock,
  cobro_proximo: DollarSign,
  tarea_asignada: ListChecks,
  cita_invitado: CalendarCheck,
}

function tiempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

export function NotificacionesBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notif[]>([])
  const [integranteId, setIntegranteId] = useState<string | null>(null)
  const noLeidas = items.filter((n) => !n.leida).length

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/notificaciones')
      const json = await res.json()
      if (json.success) {
        setItems(json.data.items)
        setIntegranteId(json.data.integrante_id)
      }
    } catch { /* red caída: la campanita no rompe el topbar */ }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  // Realtime: nuevas notificaciones aparecen sin recargar
  useEffect(() => {
    if (!integranteId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notificaciones-bell-${++contadorCanales}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `integrante_id=eq.${integranteId}` },
        (payload) => setItems((prev) => [payload.new as Notif, ...prev].slice(0, 30))
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [integranteId])

  async function marcarTodasLeidas() {
    if (noLeidas === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })))
    await fetch('/api/notificaciones', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }

  function abrir(n: Notif) {
    if (n.link) router.push(n.link)
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void marcarTodasLeidas() }}>
      <DropdownMenuTrigger
        className="relative inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors hover:bg-[var(--tx-surface-1)] focus:outline-none"
        style={{ color: 'var(--tx-ink-muted)' }}
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} sin leer)` : ''}`}
      >
        <Bell size={15} />
        {noLeidas > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
          >
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 max-h-[420px] overflow-y-auto">
        <div className="px-3 py-2.5 sticky top-0 z-10" style={{ borderBottom: '1px solid var(--tx-border)', background: 'inherit' }}>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>Notificaciones</p>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px]" style={{ color: 'var(--tx-ink-muted)' }}>
            Sin notificaciones aún
          </p>
        ) : (
          items.map((n) => {
            const Icon = ICONOS[n.tipo] ?? Bell
            return (
              <button
                key={n.id}
                onClick={() => abrir(n)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--tx-surface-1)]"
                style={{ borderBottom: '1px solid var(--tx-border)', opacity: n.leida ? 0.65 : 1 }}
              >
                <span
                  className="mt-0.5 h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: 'var(--tx-surface-2)', color: 'var(--tx-accent)' }}
                >
                  <Icon size={12} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium leading-snug" style={{ color: 'var(--tx-ink-primary)' }}>
                    {n.titulo}
                  </span>
                  {n.cuerpo && (
                    <span className="block text-[11px] truncate" style={{ color: 'var(--tx-ink-secondary)' }}>{n.cuerpo}</span>
                  )}
                  <span className="block text-[10px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>
                    {tiempoRelativo(n.created_at)}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
