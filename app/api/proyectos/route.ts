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
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

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

  // Después de crear el proyecto: la tabla puente necesita su id. Si esto
  // falla, el proyecto (y sus tareas de plantilla) ya existen en la DB sin
  // equipo asignado — en vez de dejarlo así, se deshace la creación entera y
  // se devuelve un error claro para que el cliente reintente desde cero.
  if (equipo.data && equipo.data.length > 0) {
    try {
      await repo.fijarEquipo(id, equipo.data)
    } catch (fijarEquipoError) {
      const mensaje =
        fijarEquipoError instanceof Error ? fijarEquipoError.message : 'Error desconocido'
      // El rollback mismo puede fallar (el mismo tipo de blip que hizo fallar
      // fijarEquipo). Si eso pasa, el cliente no puede saber que el proyecto
      // quedó a medias, y un reintento del POST lo duplicaría — el mensaje
      // tiene que decirlo explícito en vez de devolver el error genérico de
      // "no se creó" cuando en realidad sí quedó, sin equipo.
      try {
        await repo.eliminarCreacionParcial(id)
      } catch (rollbackError) {
        const mensajeRollback =
          rollbackError instanceof Error ? rollbackError.message : 'Error desconocido'
        console.error(
          '[proyectos POST] rollback de eliminarCreacionParcial también falló, proyecto', id,
          'quedó huérfano sin equipo:', mensajeRollback,
        )
        return NextResponse.json(
          {
            error:
              `No se pudo asignar el equipo (${mensaje}) y tampoco se pudo deshacer el proyecto ` +
              `(${mensajeRollback}). El proyecto ${id} quedó creado sin equipo — no reintentes, ` +
              'pedile a alguien que lo revise a mano antes de crear uno nuevo.',
          },
          { status: 500 },
        )
      }
      return NextResponse.json(
        { error: `No se pudo asignar el equipo, el proyecto no se creó: ${mensaje}` },
        { status: 500 },
      )
    }
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
