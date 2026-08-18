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
    // pb-24 en móvil: el nav inferior fijo tapaba el botón "Guardar cambios" del
    // perfil. max-w-5xl mx-auto: antes iba a max-w-2xl y en pantalla grande
    // quedaba una columna angosta con muchisimo negro a los costados -- el
    // problema no era el ancho del contenido, era no usar el espacio. Con mas
    // ancho disponible, WhatsApp/notificaciones y las tarjetas de PerfilForm
    // pueden ir de a dos por fila (ver los lg:grid-cols-2 de ahi abajo).
    <div className="p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Configuración</h1>
      <p className="text-[var(--tx-ink-muted)] mb-6">Tu perfil, color de calendario, horario y notificaciones</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Link
          href="/settings/whatsapp"
          className="flex items-center justify-between rounded-xl p-4 transition-colors"
          style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        >
          <span className="flex items-center gap-2.5">
            <MessageCircle size={16} className="text-emerald-500" />
            <span>
              <span className="block text-sm font-medium text-[var(--tx-ink-primary)]">WhatsApp del equipo</span>
              <span className="block text-xs text-[var(--tx-ink-muted)]">
                Vincular el número y ver el estado del puente
              </span>
            </span>
          </span>
          <ChevronRight size={16} className="text-[var(--tx-ink-muted)]" />
        </Link>
        <section
          className="rounded-xl p-4"
          style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        >
          <h2 className="text-sm font-medium text-[var(--tx-ink-primary)]">App y notificaciones</h2>
          <p className="text-xs text-[var(--tx-ink-muted)] mt-0.5 mb-3">
            Instala Tryvex en este equipo y recibe los avisos aunque tengas la pestaña cerrada.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <InstalarApp />
            <PushToggle />
          </div>
        </section>
      </div>

      <PerfilForm perfil={perfil} equipo={equipo} />
    </div>
  )
}
