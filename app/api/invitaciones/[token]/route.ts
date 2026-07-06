import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validarToken, marcarUsado } from '@/lib/repos/invitaciones'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createAdminClient()
  const { valido, invitacion, error } = await validarToken(supabase, token)

  if (!valido) {
    return NextResponse.json({ success: false, error }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    data: { email: invitacion!.email, expiresAt: invitacion!.expires_at },
  })
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createAdminClient()

  const { valido, error } = await validarToken(supabase, token)
  if (!valido) {
    return NextResponse.json({ success: false, error }, { status: 400 })
  }

  await marcarUsado(supabase, token)
  return NextResponse.json({ success: true })
}
