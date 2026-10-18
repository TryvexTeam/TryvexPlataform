import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { TareasRepository } from '@/lib/repos/tareas'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ProyectoDetalle } from '@/components/proyectos/proyecto-detalle'

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const proyRepo = new ProyectosRepository(supabase)
  const tareasRepo = new TareasRepository(supabase)

  const [proyecto, tareas, ventas, integranteId, integrantes, equipo] = await Promise.all([
    proyRepo.getById(id),
    tareasRepo.list({ proyecto_id: id }),
    proyRepo.listVentas(undefined, id),
    tareasRepo.integranteIdDe(user.id),
    new IntegrantesRepository(supabase).listActivos(),
    proyRepo.equipoDe(id),
  ])

  if (!proyecto) notFound()

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <ProyectoDetalle
        proyecto={proyecto}
        tareas={tareas}
        ventas={ventas}
        currentUserId={user.id}
        currentIntegranteId={integranteId}
        integrantes={integrantes}
        equipo={equipo}
      />
    </div>
  )
}
