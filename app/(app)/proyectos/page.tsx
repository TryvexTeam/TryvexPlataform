import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ProyectosKanban } from '@/components/proyectos/proyectos-kanban'

export default async function ProyectosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [proyectos, clientes] = await Promise.all([
    new ProyectosRepository(supabase).list(),
    new ClientesRepository(supabase).list(),
  ])

  return (
    <div className="p-6">
      <ProyectosKanban initialProyectos={proyectos} clientes={clientes} />
    </div>
  )
}
