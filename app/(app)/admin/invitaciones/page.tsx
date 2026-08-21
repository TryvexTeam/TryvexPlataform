'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { InvitacionForm } from '@/components/admin/invitacion-form'
import { InvitacionesLista } from '@/components/admin/invitaciones-lista'
import { InvitacionesPendientes } from '@/components/admin/invitaciones-pendientes'
import { Mail } from 'lucide-react'

export default function AdminInvitacionesPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-[var(--tx-ink-secondary)]" />
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx-ink-primary)]">Invitaciones</h1>
          <p className="text-sm text-[var(--tx-ink-muted)]">Genera links de acceso de un solo uso</p>
        </div>
      </div>

      <InvitacionesPendientes refreshKey={refreshKey} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva invitación</CardTitle>
          <CardDescription>El link expira en 30 minutos y solo puede usarse una vez</CardDescription>
        </CardHeader>
        <CardContent>
          <InvitacionForm onCreada={() => setRefreshKey((k) => k + 1)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviadas</CardTitle>
          <CardDescription>Últimas 50 invitaciones generadas por ti</CardDescription>
        </CardHeader>
        <CardContent>
          <InvitacionesLista refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  )
}
