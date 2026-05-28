import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { LeadUpdateSchema } from '@/lib/types/lead'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = LeadUpdateSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new LeadsRepository(supabase)
  await repo.update(id, result.data)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new LeadsRepository(supabase)
  await repo.delete(id)
  return NextResponse.json({ ok: true })
}
