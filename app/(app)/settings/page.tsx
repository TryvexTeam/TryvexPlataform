import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { PerfilForm } from '@/components/settings/perfil-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new IntegrantesRepository(supabase)
  const [perfil, equipo] = await Promise.all([
    repo.getByAuthUser(user.id),
    repo.listActivos(),
  ])

  if (!perfil) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Configuración</h1>
        <p className="text-neutral-500 mt-1">No eres integrante activo. Contacta al administrador.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Configuración</h1>
      <p className="text-neutral-500 mb-6">Tu perfil, color de calendario, horario y notificaciones</p>
      <PerfilForm perfil={perfil} equipo={equipo} />
    </div>
  )
}
