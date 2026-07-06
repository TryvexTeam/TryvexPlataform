import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  crearInvitacion,
  getInvitacionesPorIntegrante,
  verificarRateLimit,
} from '@/lib/repos/invitaciones'
import { enviarEmailInvitacion } from '@/lib/email/invitacion'

const CrearInvitacionSchema = z.object({
  email: z.string().email('Email inválido'),
  enviarEmail: z.boolean().default(true),
})

async function getIntegrante(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from('dim_integrantes')
    .select('id')
    .eq('auth_user_id', userId)
    .single()
  if (error || !data) return null
  return data as { id: string }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const integrante = await getIntegrante(supabase, user.id)
    if (!integrante) return NextResponse.json({ error: 'Integrante no encontrado' }, { status: 403 })

    const { permitido, restantes } = await verificarRateLimit(supabase, integrante.id)
    if (!permitido) {
      return NextResponse.json(
        { error: 'Límite de invitaciones alcanzado. Máximo 10 por hora.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const result = CrearInvitacionSchema.safeParse(body)
    if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

    const { email, enviarEmail } = result.data
    const { invitacion, tokenRaw } = await crearInvitacion(supabase, email, integrante.id)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const link = `${appUrl}/signup?token=${tokenRaw}`

    if (enviarEmail) {
      try {
        await enviarEmailInvitacion({ email, link })
      } catch {
        // Email falló pero el token ya está creado — devolver link de todas formas
      }
    }

    return NextResponse.json(
      { success: true, data: { id: invitacion.id, link, restantes: restantes - 1 } },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('[POST /api/invitaciones]', message)
    return NextResponse.json({ error: message || 'Error interno' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const integrante = await getIntegrante(supabase, user.id)
    if (!integrante) return NextResponse.json({ error: 'Integrante no encontrado' }, { status: 403 })

    const invitaciones = await getInvitacionesPorIntegrante(supabase, integrante.id)
    return NextResponse.json({ success: true, data: invitaciones })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('[GET /api/invitaciones]', message)
    return NextResponse.json({ error: message || 'Error interno' }, { status: 500 })
  }
}
