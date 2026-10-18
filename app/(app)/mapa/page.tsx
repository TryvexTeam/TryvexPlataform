import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { MapaRepository } from '@/lib/repos/mapa'
import { MapaLeads } from '@/components/mapa/mapa-leads'

export const metadata = { title: 'Mapa — Tryvex CRM' }

export default async function MapaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const yo = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!yo) redirect('/login')

  const datos = await new MapaRepository(supabase).obtener()
  return (
    <div className="w-full p-4 md:p-6">
      <MapaLeads datos={datos} />
    </div>
  )
}
