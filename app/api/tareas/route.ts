import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'
import { TareaInsertSchema } from '@/lib/types/tarea'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = TareaInsertSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 })
  }

  const repo = new TareasRepository(supabase)
  const id = await repo.create(result.data, user.id)
  return NextResponse.json({ id }, { status: 201 })
}
