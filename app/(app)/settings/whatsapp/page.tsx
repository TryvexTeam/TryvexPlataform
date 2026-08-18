import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { obtenerEstadoQr } from '@/lib/wa/qr'
import { WhatsappVinculacion } from '@/components/settings/whatsapp-vinculacion'

// El QR caduca cada ~20s: esta vista nunca se sirve desde caché.
export const dynamic = 'force-dynamic'

export default async function WhatsappSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new IntegrantesRepository(supabase)
  const perfil = await repo.getByAuthUser(user.id)

  if (!perfil) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">WhatsApp</h1>
        <p className="text-[var(--tx-ink-muted)] mt-1">
          No eres integrante activo. Contacta al administrador.
        </p>
      </div>
    )
  }

  return (
    // pb-24 en móvil: mismo problema que en Configuración, el nav inferior fijo tapa el final.
    <div className="p-6 pb-24 md:pb-6 max-w-2xl mx-auto">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Configuración
      </Link>
      <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">WhatsApp</h1>
      <p className="text-[var(--tx-ink-muted)] mb-6">
        Estado del puente y vinculación del número que usa el CRM
      </p>
      <WhatsappVinculacion inicial={await obtenerEstadoQr()} />
    </div>
  )
}
