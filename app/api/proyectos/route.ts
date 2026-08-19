import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ProyectoInsertSchema } from '@/lib/types/proyecto'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const result = ProyectoInsertSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new ProyectosRepository(supabase)
  // `crearConPlantilla` y no `create`: si el proyecto trae servicio del
  // catálogo, nacen con él las tareas base de ese servicio. Sin servicio se
  // comporta igual que antes, así que los proyectos sin plantilla no cambian.
  const yoIntegrante = await new (await import('@/lib/repos/integrantes')).IntegrantesRepository(
    supabase,
  ).getByAuthUser(user.id)
  const id = await repo.crearConPlantilla(
    result.data,
    result.data.servicios_ids ?? [],
    yoIntegrante?.id ?? null,
  )

  // Aviso: al responsable si existe; si no, a todo el equipo
  const { NotificacionesRepository } = await import('@/lib/repos/notificaciones')
  const notif = new NotificacionesRepository(supabase)
  const yo = yoIntegrante
  await notif.notificar({
    destinatarios: result.data.responsable_id ? [result.data.responsable_id] : await notif.idsActivos(),
    tipo: 'proyecto_asignado',
    titulo: result.data.responsable_id
      ? `Proyecto asignado: ${result.data.nombre}`
      : `Nuevo proyecto: ${result.data.nombre}`,
    link: `/proyectos/${id}`,
    excluir: yo?.id ?? null,
  })

  return NextResponse.json({ id }, { status: 201 })
}
