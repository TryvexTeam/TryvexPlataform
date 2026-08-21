'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale/es'
import { Check, ShieldAlert } from 'lucide-react'
import type { InvitacionConEstado } from '@/lib/types/invitacion'

type Pendiente = InvitacionConEstado & { invitado_por_nombre: string }

/**
 * Se autoescatima para cualquiera que no sea superadmin: la API devuelve 403
 * y este componente simplemente no renderiza nada, en vez de mostrar un
 * error — un integrante normal no tiene por qué enterarse de que esta
 * sección existe.
 */
export function InvitacionesPendientes({ refreshKey }: { refreshKey: number }) {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null)
  const [aprobando, setAprobando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res = await fetch('/api/invitaciones/pendientes')
    if (!res.ok) { setPendientes(null); return }
    const json = await res.json()
    setPendientes(json.data)
  }, [])

  useEffect(() => { cargar() }, [cargar, refreshKey])

  async function aprobar(inv: Pendiente) {
    setAprobando(inv.id)
    try {
      const res = await fetch(`/api/invitaciones/${inv.id}/aprobar`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'No se pudo aprobar')
        return
      }
      toast.success(`Invitación a ${inv.email} aprobada`)
      setPendientes((prev) => prev?.filter((p) => p.id !== inv.id) ?? null)
    } finally {
      setAprobando(null)
    }
  }

  if (!pendientes) return null
  if (pendientes.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Pendientes de aprobación
        </CardTitle>
        <CardDescription>
          Otros integrantes generaron estas invitaciones; no funcionan hasta que las apruebes
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-[var(--tx-border)]">
        {pendientes.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-[var(--tx-ink-primary)]">{inv.email}</p>
              <p className="text-xs text-[var(--tx-ink-muted)]">
                Invitado por {inv.invitado_por_nombre} ·{' '}
                {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: es })}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={aprobando === inv.id}
              onClick={() => aprobar(inv)}
            >
              <Check className="h-3.5 w-3.5" />
              {aprobando === inv.id ? 'Aprobando...' : 'Aprobar'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
