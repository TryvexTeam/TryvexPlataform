import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EventosRepository } from '@/lib/repos/eventos'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new EventosRepository(supabase)
  await repo.delete(id) // RLS: solo el creador puede borrar
  return NextResponse.json({ success: true })
}
