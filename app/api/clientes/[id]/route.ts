import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ClienteUpdateSchema } from '@/lib/types/cliente'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const result = ClienteUpdateSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new ClientesRepository(supabase)
  await repo.update(id, result.data)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  await new ClientesRepository(supabase).delete(id)
  return NextResponse.json({ ok: true })
}
