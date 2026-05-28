import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { TareasRepository } from '@/lib/repos/tareas'
import { ProyectoDetalle } from '@/components/proyectos/proyecto-detalle'

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const proyRepo = new ProyectosRepository(supabase)
  const tareasRepo = new TareasRepository(supabase)

  const [proyecto, tareas, ventas] = await Promise.all([
    proyRepo.getById(id),
    tareasRepo.list({ proyecto_id: id }),
    proyRepo.listVentas(undefined, id),
  ])

  if (!proyecto) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ProyectoDetalle proyecto={proyecto} tareas={tareas} ventas={ventas} />
    </div>
  )
}
