import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EquipoTabs } from '@/components/equipo/equipo-tabs'

export const metadata = {
  title: 'Equipo — Tryvex CRM',
  description: 'Disponibilidad semanal del equipo y ventanas comunes para agendar.',
}

export default async function ReunionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8 flex flex-col gap-5">
      <header>
        <h1
          className="text-[22px] font-extrabold"
          style={{ color: 'var(--tx-ink-primary)' }}
        >
          Calendario del equipo
        </h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--tx-ink-muted)' }}>
          Eventos de la semana sobre la disponibilidad del equipo. Arrastra en el
          calendario para agendar; pinta tu disponibilidad en su pestaña.
        </p>
      </header>

      <EquipoTabs />
    </div>
  )
}
