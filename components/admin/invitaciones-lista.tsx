'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale/es'
import type { InvitacionConEstado } from '@/lib/types/invitacion'

const estadoBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pendiente_aprobacion: { label: 'Esperando aprobación', variant: 'destructive' },
  pendiente: { label: 'Pendiente', variant: 'default' },
  usado: { label: 'Usado', variant: 'secondary' },
  expirado: { label: 'Expirado', variant: 'destructive' },
}

interface InvitacionesListaProps {
  refreshKey: number
}

export function InvitacionesLista({ refreshKey }: InvitacionesListaProps) {
  const [invitaciones, setInvitaciones] = useState<InvitacionConEstado[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/invitaciones')
      const json = await res.json()
      if (res.ok) setInvitaciones(json.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // `cargar` es async: en este tick solo arranca el fetch, y el setState
    // pasa recien cuando responde. La regla no puede ver a traves del await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
  }, [cargar, refreshKey])

  if (loading) {
    return <p className="text-sm text-neutral-400 text-center py-6">Cargando...</p>
  }

  if (invitaciones.length === 0) {
    return <p className="text-sm text-neutral-400 text-center py-6">No hay invitaciones aún.</p>
  }

  return (
    <div className="divide-y">
      {invitaciones.map((inv) => {
        const badge = estadoBadge[inv.estado]
        return (
          <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{inv.email}</p>
              <p className="text-xs text-neutral-400">
                {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: es })}
              </p>
            </div>
            <Badge variant={badge.variant} className="shrink-0">
              {badge.label}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}
