import Link from 'next/link'
import { redirect } from 'next/navigation'
import { KeyRound, UserX } from 'lucide-react'
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
        <p className="text-[var(--tx-ink-muted)]">Solo el administrador de Tryvex puede repartir accesos.</p>
      </div>
    )
  }

  const equipo = await repo.listEquipo()

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6 pb-24 md:pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <KeyRound className="h-6 w-6 text-neutral-700" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-[var(--tx-ink-primary)]">Accesos</h1>
          <p className="text-sm text-[var(--tx-ink-muted)]">
            Reparte visibilidad sin convertir a nadie en administrador
          </p>
        </div>
        {/* Quitar acceso y desvincular viven en su propia pantalla: son acciones
            destructivas y no se mezclan con los interruptores de visibilidad. */}
        <Link
          href="/admin/acceso"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--tx-border)] px-3 text-sm font-medium text-[var(--tx-ink-primary)] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tx-accent)]"
        >
          <UserX className="h-4 w-4" aria-hidden="true" />
          Quitar acceso o desvincular
        </Link>
      </div>

      <PermisosEquipo equipoInicial={equipo} />
    </div>
  )
}
