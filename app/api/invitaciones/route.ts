import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  crearInvitacion,
  getInvitacionesPorIntegrante,
  verificarRateLimit,
} from '@/lib/repos/invitaciones'
import { PermisosRepository } from '@/lib/repos/permisos'
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
    if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

    const { email, enviarEmail } = result.data

    // Quien invita no siempre es quien aprueba: si ya es superadmin, la
    // invitación nace autoaprobada; si no, queda pendiente para el panel de
    // aprobación y NO se manda el mail todavía — un mail con un link que
    // todavía no funciona confunde más de lo que ayuda.
    const yo = await new PermisosRepository(supabase).misPermisos(user.id)
    const invitadorEsSuperadmin = Boolean(yo?.es_superadmin)

    const { invitacion, tokenRaw } = await crearInvitacion(supabase, email, integrante.id, invitadorEsSuperadmin)

    // Sin env configurada, usar el origin real del request (en prod = dominio de producción)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
    const link = `${appUrl}/signup?token=${tokenRaw}`

    // Se manda igual aunque quede pendiente de aprobación: el token no
    // cambia cuando se aprueba (solo se guarda su hash, no se puede volver
    // a generar el link más adelante), así que es el mismo link de siempre
    // el que empieza a funcionar en cuanto un superadmin lo apruebe. Si el
    // invitado lo abre antes, ve el mensaje de "todavía no fue aprobada" en
    // vez de un error genérico.
    if (enviarEmail) {
      try {
        await enviarEmailInvitacion({ email, link })
      } catch {
        // Email falló pero el token ya está creado — devolver link de todas formas
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: invitacion.id,
          link,
          restantes: restantes - 1,
          requiereAprobacion: !invitadorEsSuperadmin,
        },
      },
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
