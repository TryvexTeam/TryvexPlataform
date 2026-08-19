import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const repo = new NotificacionesRepository(supabase)
  const items = await repo.listRecientes(perfil.id)
  return NextResponse.json({ success: true, data: { integrante_id: perfil.id, items } })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { ids?: string[] }
  const repo = new NotificacionesRepository(supabase)
  await repo.marcarLeidas(perfil.id, body.ids)
  return NextResponse.json({ success: true })
}

/**
 * Descarta notificaciones. Sin `ids` en el cuerpo, vacía la bandeja entera
 * ("Borrar todas"); con `ids`, solo esas — que es lo que manda el gesto de
 * deslizar una tarjeta.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] }
  try {
    await new NotificacionesRepository(supabase).eliminar(perfil.id, body.ids)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudo descartar'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
