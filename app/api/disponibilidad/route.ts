import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DisponibilidadRepository } from '@/lib/repos/disponibilidad'
import { DisponibilidadPutSchema } from '@/lib/types/disponibilidad'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const repo = new DisponibilidadRepository(supabase)
  const data = await repo.listAll(user.id)
  return NextResponse.json({ success: true, data })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const result = DisponibilidadPutSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const repo = new DisponibilidadRepository(supabase)
  const integranteId = await repo.integranteIdDe(user.id)
  if (!integranteId) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  await repo.replaceOwn(integranteId, result.data.celdas)
  return NextResponse.json({ success: true })
}
