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

  try {
    const repo = new TareasRepository(supabase)
    // created_by es FK a dim_integrantes.id — mapear desde auth user (null si no es integrante)
    const integranteId = await repo.integranteIdDe(user.id)
    const { responsables_ids, ...tarea } = result.data
    const id = await repo.create(tarea, integranteId)
    if (responsables_ids && responsables_ids.length > 0) {
      await repo.setResponsables(id, responsables_ids)
    }
    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear tarea'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
