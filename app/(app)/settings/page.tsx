import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { PerfilForm } from '@/components/settings/perfil-form'
import { InstalarApp } from '@/components/layout/instalar-app'
import { PushToggle } from '@/components/layout/push-toggle'

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
      <Link
        href="/settings/whatsapp"
        className="mb-6 flex items-center justify-between rounded-lg border border-neutral-200 p-4 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <MessageCircle size={16} className="text-emerald-600" />
          <span>
            <span className="block text-sm font-medium text-neutral-800">WhatsApp del equipo</span>
            <span className="block text-xs text-neutral-500">
              Vincular el número y ver el estado del puente
            </span>
          </span>
        </span>
        <ChevronRight size={16} className="text-neutral-400" />
      </Link>
      <section className="mb-6 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-medium text-neutral-800">App y notificaciones</h2>
        <p className="text-xs text-neutral-500 mt-0.5 mb-3">
          Instala Tryvex en este equipo y recibe los avisos aunque tengas la pestaña cerrada.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <InstalarApp />
          <PushToggle />
        </div>
      </section>

      <PerfilForm perfil={perfil} equipo={equipo} />
    </div>
  )
}
