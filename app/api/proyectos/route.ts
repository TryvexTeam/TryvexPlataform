import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ProyectoInsertSchema } from '@/lib/types/proyecto'
import { z } from 'zod'

/* El equipo llega junto al proyecto pero no es una columna suya: son filas de
   `proyecto_integrantes`. Por eso se valida aparte y no dentro del esquema del
   proyecto, donde acabaría intentando insertarse como campo. */
const EquipoSchema = z.array(z.string().uuid()).optional()

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuerpo = await req.json()
  const result = ProyectoInsertSchema.safeParse(cuerpo)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const equipo = EquipoSchema.safeParse(cuerpo?.integrantes_ids)
  if (!equipo.success) {
    return NextResponse.json({ error: 'Equipo inválido' }, { status: 400 })
  }

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

  // Después de crear el proyecto: la tabla puente necesita su id.
  if (equipo.data && equipo.data.length > 0) {
    await repo.fijarEquipo(id, equipo.data)
  }

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
