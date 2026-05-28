import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { InteraccionInsertSchema } from '@/lib/types/lead'
import { z } from 'zod'

const Schema = InteraccionInsertSchema.extend({ integrante_id: z.string().uuid() })

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = Schema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new LeadsRepository(supabase)
  await repo.createInteraccion(result.data)

  // Devolver la interacción recién creada
  const interacciones = await repo.listInteracciones(result.data.lead_id)
  return NextResponse.json(interacciones[0], { status: 201 })
}
