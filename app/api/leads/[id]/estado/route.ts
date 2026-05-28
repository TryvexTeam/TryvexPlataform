import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'

const EstadoSchema = z.object({
  estado: z.enum(['sin_contactar', 'contactado', 'interesado', 'reunion_agendada', 'cerrado', 'descartado']),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const result = EstadoSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const repo = new LeadsRepository(supabase)
  await repo.cambiarEstado(id, result.data.estado)
  return NextResponse.json({ ok: true })
}
