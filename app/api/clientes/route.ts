import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ClienteInsertSchema } from '@/lib/types/cliente'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const result = ClienteInsertSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new ClientesRepository(supabase)
  const id = await repo.create(result.data)
  return NextResponse.json({ id }, { status: 201 })
}
