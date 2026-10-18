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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 md:p-8">
      {/*
        El h1 va solo para lectores de pantalla. En la pantalla el título es el
        rango de la semana que pinta el propio calendario: tener "Calendario del
        equipo" encima y "18 – 24 agosto" debajo apilaba dos títulos donde el
        segundo es el único que cambia y el único que se lee de verdad.

        El ancho sube de 1100 a 1400 —el mismo del Panel de Mando—: siete días
        en 1100 px dejan columnas de 150, y ahí un evento con nombre de empresa
        no cabe.
      */}
      <h1 className="sr-only">Calendario del equipo</h1>

      <EquipoTabs />
    </div>
  )
}
