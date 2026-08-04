import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { PermisosEquipo } from '@/components/admin/permisos-equipo'

export const dynamic = 'force-dynamic'

export default async function AdminPermisosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new PermisosRepository(supabase)
  const yo = await repo.misPermisos(user.id)

  // No se redirige: quien llega aquí sin ser dueño merece saber por qué no puede
  // entrar. Un redirect mudo parecería un error de la app.
  if (!yo?.es_superadmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Accesos</h1>
        <p className="text-neutral-500">Solo el administrador de Tryvex puede repartir accesos.</p>
      </div>
    )
  }

  const equipo = await repo.listEquipo()

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-neutral-700" />
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx-ink-primary)]">Accesos</h1>
          <p className="text-sm text-neutral-500">
            Reparte visibilidad sin convertir a nadie en administrador
          </p>
        </div>
      </div>

      <PermisosEquipo equipoInicial={equipo} />
    </div>
  )
}
