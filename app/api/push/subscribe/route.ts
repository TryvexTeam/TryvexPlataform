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

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ success: false, error: 'Falta endpoint' }, { status: 400 })

  try {
    await new PushRepository(supabase).eliminar(body.endpoint, perfil.id)
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error borrando la suscripción' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}

/**
 * Cuántos dispositivos tiene registrados quien pregunta, y si el servidor puede
 * mandar push.
 *
 * Existe para poder responder "¿por qué no me llega la notificación?" sin
 * adivinar. Son tres causas distintas con arreglos distintos y hasta ahora
 * ninguna era visible: el teléfono no está suscrito, faltan las llaves VAPID en
 * el entorno, o el envío sale y el sistema operativo no la muestra.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, last_used_at, created_at')
    .eq('integrante_id', perfil.id)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const subs = (data ?? []) as { endpoint: string; last_used_at: string | null; created_at: string }[]

  return NextResponse.json({
    success: true,
    data: {
      // El endpoint completo es una credencial: se recorta al servicio y poco más.
      dispositivos: subs.map((s) => ({
        servicio: new URL(s.endpoint).hostname,
        creado: s.created_at,
        ultimo_uso: s.last_used_at,
      })),
      // Sin esto no se puede distinguir "no tengo el teléfono registrado" de
      // "el servidor no tiene con qué firmar el envío".
      servidor_puede_enviar: Boolean(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
      ),
    },
  })
}
