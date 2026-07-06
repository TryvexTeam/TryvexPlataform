import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ClientesWorkspace } from '@/components/clientes/clientes-workspace'

export default async function ClientesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientesRepo = new ClientesRepository(supabase)
  const proyectosRepo = new ProyectosRepository(supabase)

  const [clientes, proyectos, ventas] = await Promise.all([
    clientesRepo.list(),
    proyectosRepo.list(),
    proyectosRepo.listVentas(),
  ])

  return (
    <div className="h-full flex flex-col">
      <ClientesWorkspace
        clientes={clientes}
        proyectos={proyectos}
        ventas={ventas}
      />
    </div>
  )
}
