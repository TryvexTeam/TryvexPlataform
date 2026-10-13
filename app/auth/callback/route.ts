import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { AccesoRepository } from '@/lib/repos/acceso'
import { marcarPendientesUsadasPorEmail, marcarUsado, validarToken } from '@/lib/repos/invitaciones'

function haciaLogin(request: Request, motivo: string, esperado?: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('motivo', motivo)
  if (esperado) url.searchParams.set('esperado', esperado)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const token = url.searchParams.get('invitacion')
  if (!code) return haciaLogin(request, 'google_error')
  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  const emailGoogle = data.user?.email
  if (error || !data.user || !emailGoogle) return haciaLogin(request, 'google_error')

  const user = data.user
  const email = emailGoogle.toLowerCase()
  const admin = createAdminClient()
  try {
    const acceso = new AccesoRepository(admin)
    const integranteVinculado = await acceso.getPorAuthUser(user.id)
    const integrante = integranteVinculado ?? await acceso.getDesvinculadoPorEmail(email)
    let invitacion: Awaited<ReturnType<typeof validarToken>> | null = null
    if (token) invitacion = await validarToken(admin, token)

    if (token && !invitacion?.valido) {
      await supabase.auth.signOut()
      if (!integranteVinculado && Date.now() - new Date(user.created_at).getTime() < 600_000) await admin.auth.admin.deleteUser(user.id)
      return haciaLogin(request, 'google_error')
    }

    if (token && invitacion?.valido && invitacion.invitacion?.email.toLowerCase() !== email) {
      await supabase.auth.signOut()
      if (!integranteVinculado && Date.now() - new Date(user.created_at).getTime() < 600_000) await admin.auth.admin.deleteUser(user.id)
      return haciaLogin(request, 'google_correo_distinto', invitacion.invitacion?.email)
    }

    if (integrante?.desvinculado_at) {
      await supabase.auth.signOut()
      if (!integranteVinculado && Date.now() - new Date(user.created_at).getTime() < 600_000) await admin.auth.admin.deleteUser(user.id)
      return haciaLogin(request, 'desvinculado')
    }

    if (integrante?.activo) {
      if (token && invitacion?.valido) await marcarUsado(admin, token)
      if (!token) await marcarPendientesUsadasPorEmail(admin, email)
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    await supabase.auth.signOut()
    if (!integranteVinculado && Date.now() - new Date(user.created_at).getTime() < 600_000) await admin.auth.admin.deleteUser(user.id)
    return haciaLogin(request, integrante?.desvinculado_at ? 'desvinculado' : 'google_sin_invitacion')
  } catch (error) {
    console.error('[auth/callback] error procesando OAuth:', error)
    await supabase.auth.signOut()
    return haciaLogin(request, 'google_error')
  }
}
