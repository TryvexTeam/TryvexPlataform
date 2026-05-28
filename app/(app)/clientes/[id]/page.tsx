import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ClienteDetalle } from '@/components/clientes/cliente-detalle'

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientesRepo = new ClientesRepository(supabase)
  const proyectosRepo = new ProyectosRepository(supabase)

  const [cliente, proyectos, ventas] = await Promise.all([
    clientesRepo.getById(id),
    proyectosRepo.list({ cliente_id: id }),
    proyectosRepo.listVentas(id),
  ])

  if (!cliente) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ClienteDetalle cliente={cliente} proyectos={proyectos} ventas={ventas} />
    </div>
  )
}
