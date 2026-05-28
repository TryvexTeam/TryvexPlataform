import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { LeadInsertSchema } from '@/lib/types/lead'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = LeadInsertSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new LeadsRepository(supabase)
  const id = await repo.create(result.data)
  return NextResponse.json({ id }, { status: 201 })
}
