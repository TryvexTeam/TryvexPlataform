'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { InvitacionForm } from '@/components/admin/invitacion-form'
import { InvitacionesLista } from '@/components/admin/invitaciones-lista'
import { InvitacionesPendientes } from '@/components/admin/invitaciones-pendientes'

/**
 * El panel de invitaciones. `esSuperadmin` llega resuelto desde el servidor
 * (misma fuente que el resto de la app: `PermisosRepository.misPermisos`), y
 * solo con él montamos `InvitacionesPendientes`. Así un integrante normal ni
 * siquiera dispara el `GET /api/invitaciones/pendientes` que le devolvería 403.
 */
export function InvitacionesPanel({ esSuperadmin }: { esSuperadmin: boolean }) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      {esSuperadmin && <InvitacionesPendientes refreshKey={refreshKey} />}

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
