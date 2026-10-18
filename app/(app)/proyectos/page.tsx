import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ClientesRepository } from '@/lib/repos/clientes'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ProyectosKanban } from '@/components/proyectos/proyectos-kanban'

export default async function ProyectosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [proyectos, clientes, integrantes] = await Promise.all([
    new ProyectosRepository(supabase).list(),
    new ClientesRepository(supabase).list(),
    new IntegrantesRepository(supabase).listActivos(),
  ])

  return (
    <div className="p-6">
      <ProyectosKanban initialProyectos={proyectos} clientes={clientes} integrantes={integrantes} />
    </div>
  )
}
