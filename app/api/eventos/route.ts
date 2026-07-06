import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EventosRepository } from '@/lib/repos/eventos'
import { EventoInsertSchema } from '@/lib/types/evento'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  if (!desde || !hasta) {
    return NextResponse.json({ success: false, error: 'Faltan params desde/hasta' }, { status: 400 })
  }

  const repo = new EventosRepository(supabase)
  const data = await repo.listRango(desde, hasta, user.id)
  return NextResponse.json({ success: true, data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const result = EventoInsertSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues }, { status: 400 })
  }

  const repo = new EventosRepository(supabase)
  const integranteId = await repo.integranteIdDe(user.id)
  if (!integranteId) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const id = await repo.create(result.data, integranteId)
  return NextResponse.json({ success: true, data: { id } }, { status: 201 })
}
