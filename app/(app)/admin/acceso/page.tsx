import { redirect } from 'next/navigation'
import { UserX } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { AccesoRepository } from '@/lib/repos/acceso'
import { AccesoEquipo } from '@/components/admin/acceso-equipo'

export const dynamic = 'force-dynamic'

export default async function AdminAccesoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const yo = await new PermisosRepository(supabase).misPermisos(user.id)

  // Mismo criterio que la pantalla de permisos: no se redirige. Quien llega acá sin
  // ser dueño merece leer por qué no puede, en vez de rebotar a otra página y creer
  // que la app se rompió.
  if (!yo?.es_superadmin) {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-2xl font-bold text-[var(--tx-ink-primary)]">Acceso a la app</h1>
        <p className="text-neutral-500">Solo el administrador de Tryvex puede quitar o devolver el acceso.</p>
      </div>
    )
  }

  // Se lee con la clave de servicio porque la lista tiene que incluir a los
  // inactivos, y la RLS de dim_integrantes solo deja ver a los del equipo. Sin
  // esto, los revocados desaparecerían de la pantalla y nadie podría restaurarlos.
  const equipo = await new AccesoRepository(createAdminClient()).listEquipo()

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <UserX className="h-6 w-6 text-neutral-700" />
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx-ink-primary)]">Acceso a la app</h1>
          <p className="text-sm text-neutral-500">
            Quitar el acceso cierra las sesiones abiertas de la persona e impide que vuelva a entrar
          </p>
        </div>
      </div>

      <AccesoEquipo equipoInicial={equipo} miIntegranteId={yo.id} />
    </div>
  )
}
