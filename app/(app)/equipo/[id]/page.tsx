import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { PerfilIntegranteRepository } from '@/lib/repos/perfil-integrante'
import { PerfilIntegranteVista } from '@/components/perfil-integrante/perfil-integrante'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PerfilIntegrantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Solo el equipo ve perfiles: quien no es integrante activo no pasa de acá.
  const yo = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!yo) redirect('/login')

  const perfil = await new PerfilIntegranteRepository(supabase).obtener(id)
  if (!perfil) notFound()

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <PerfilIntegranteVista perfil={perfil} esPropio={yo.id === id} />
    </div>
  )
}
