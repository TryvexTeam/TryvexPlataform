import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository, TareaPadreInvalidaError } from '@/lib/repos/tareas'

const Schema = z.object({
  tarea_id: z.string().uuid(),
  descripcion: z.string().min(1),
  orden: z.number().optional(),
})

/**
 * Pasos de una tarea. Lo pide el modal de pasos del tablero, que necesita las
 * descripciones y no las tiene: el kanban solo carga el CONTEO de subtareas
 * (ver `progresoSubtareas`) para no arrastrar el texto de todas las tareas en
 * cada carga del tablero. El texto se trae recién cuando alguien abre el modal.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tareaId = new URL(req.url).searchParams.get('tarea_id')
  if (!tareaId || !z.string().uuid().safeParse(tareaId).success) {
    return NextResponse.json({ error: 'tarea_id inválido' }, { status: 400 })
  }

  const repo = new TareasRepository(supabase)
  return NextResponse.json(await repo.listSubtareas(tareaId))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = Schema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  const repo = new TareasRepository(supabase)
  try {
    const subtarea = await repo.createSubtarea(result.data)
    return NextResponse.json(subtarea, { status: 201 })
  } catch (err) {
    if (err instanceof TareaPadreInvalidaError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    throw err
  }
}
