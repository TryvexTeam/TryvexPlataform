import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PagosRepository } from '@/lib/repos/pagos'
import { VentaInsertSchema } from '@/lib/types/proyecto'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const result = VentaInsertSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ success: false, error: result.error.issues }, { status: 400 })

  const repo = new PagosRepository(supabase)
  const id = await repo.create(result.data)
  return NextResponse.json({ success: true, data: { id } }, { status: 201 })
}
