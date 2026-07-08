import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'
import { TareaUpdateSchema } from '@/lib/types/tarea'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = TareaUpdateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 })
  }

  try {
    const repo = new TareasRepository(supabase)
    const { responsables_ids, ...tarea } = result.data
    if (Object.keys(tarea).length > 0) {
      await repo.update(id, tarea)
    }
    if (responsables_ids) {
      await repo.setResponsables(id, responsables_ids)
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar tarea'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new TareasRepository(supabase)
  await repo.delete(id)
  return NextResponse.json({ ok: true })
}
