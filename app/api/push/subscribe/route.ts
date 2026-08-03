import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { PushRepository } from '@/lib/repos/push'

const SuscripcionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = SuscripcionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Suscripción inválida' }, { status: 400 })
  }

  const { endpoint, keys } = parsed.data
  try {
    await new PushRepository(supabase).guardar({
      integranteId: perfil.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers.get('user-agent'),
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error guardando la suscripción' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ success: false, error: 'Falta endpoint' }, { status: 400 })

  try {
    await new PushRepository(supabase).eliminar(body.endpoint)
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error borrando la suscripción' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
