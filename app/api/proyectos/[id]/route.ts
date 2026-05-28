import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ProyectoUpdateSchema } from '@/lib/types/proyecto'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const result = ProyectoUpdateSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  await new ProyectosRepository(supabase).update(id, result.data)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  await new ProyectosRepository(supabase).delete(id)
  return NextResponse.json({ ok: true })
}
