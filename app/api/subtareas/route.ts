import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'

const Schema = z.object({
  tarea_id: z.string().uuid(),
  descripcion: z.string().min(1),
  orden: z.number().optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = Schema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new TareasRepository(supabase)
  const subtarea = await repo.createSubtarea(result.data)
  return NextResponse.json(subtarea, { status: 201 })
}
