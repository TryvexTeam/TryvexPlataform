import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'

const Schema = z.object({
  estado: z.enum(['brief', 'desarrollo', 'revision', 'entregado', 'mantencion', 'cerrado']),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const result = Schema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  await new ProyectosRepository(supabase).cambiarEstado(id, result.data.estado)
  return NextResponse.json({ ok: true })
}
