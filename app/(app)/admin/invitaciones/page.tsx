import { redirect } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { InvitacionesPanel } from '@/components/admin/invitaciones-panel'

export const dynamic = 'force-dynamic'

export default async function AdminInvitacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const yo = await new PermisosRepository(supabase).misPermisos(user.id)

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-[var(--tx-ink-secondary)]" />
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx-ink-primary)]">Invitaciones</h1>
          <p className="text-sm text-[var(--tx-ink-muted)]">Genera links de acceso de un solo uso</p>
        </div>
      </div>

      <InvitacionesPanel esSuperadmin={yo?.es_superadmin ?? false} />
    </div>
  )
}
