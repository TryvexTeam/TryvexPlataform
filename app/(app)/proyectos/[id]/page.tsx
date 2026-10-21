import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { TareasRepository } from '@/lib/repos/tareas'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ProyectoDetalle } from '@/components/proyectos/proyecto-detalle'
import { ProyectoMonitoreo } from '@/components/proyectos/proyecto-monitoreo'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { MonitoreoSaasRepository } from '@/lib/repos/monitoreo-saas'
import { armarVista } from '@/lib/monitoreo/ejecutar'
import type { VistaMonitoreo } from '@/lib/types/monitoreo'

type CargaMonitoreo = { vista: VistaMonitoreo | null; error: string | null }

/** Solo con permiso de finanzas (la RLS lo exige igual). Un error no tumba la ficha. */
async function cargarMonitoreo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proyectoId: string,
  verFinanzas: boolean,
): Promise<CargaMonitoreo> {
  if (!verFinanzas) return { vista: null, error: null }
  try {
    return { vista: await armarVista(new MonitoreoSaasRepository(supabase), proyectoId), error: null }
  } catch (e) {
    return { vista: null, error: e instanceof Error ? e.message : 'No se pudo cargar el monitoreo.' }
  }
}

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const proyRepo = new ProyectosRepository(supabase)
  const tareasRepo = new TareasRepository(supabase)

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  const [proyecto, tareas, ventas, integranteId, integrantes, equipo, monitoreo] = await Promise.all([
    proyRepo.getById(id),
    tareasRepo.list({ proyecto_id: id }),
    proyRepo.listVentas(undefined, id),
    tareasRepo.integranteIdDe(user.id),
    new IntegrantesRepository(supabase).listActivos(),
    proyRepo.equipoDe(id),
    cargarMonitoreo(supabase, id, puede(perfil, 'ver_finanzas')),
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
      {(monitoreo.vista || monitoreo.error) && (
        <ProyectoMonitoreo
          proyectoId={proyecto.id}
          vista={monitoreo.vista}
          error={monitoreo.error}
          puedeActualizar={puede(perfil, 'gestionar_finanzas')}
        />
      )}
    </div>
  )
}
