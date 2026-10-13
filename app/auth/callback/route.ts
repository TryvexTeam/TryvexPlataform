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

  // Solo se borra una cuenta recién creada por este flujo de Google: todas sus
  // identidades son google y nació hace menos de 10 minutos. Una cuenta antigua o
  // con contraseña/otro proveedor NUNCA se borra aquí.
  const identidades = user.identities ?? []
  const esCuentaNuevaDeGoogle =
    identidades.length > 0 &&
    identidades.every((identidad) => identidad.provider === 'google') &&
    Date.now() - new Date(user.created_at).getTime() < 600_000

  async function limpiar(borrar: boolean) {
    const { error: errorSalida } = await supabase.auth.signOut()
    if (errorSalida) console.error('[auth/callback] signOut falló:', errorSalida.message)
    if (!borrar) return
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(user.id)
    if (errorBorrado) console.error('[auth/callback] deleteUser falló:', errorBorrado.message)
  }

  try {
    const acceso = new AccesoRepository(admin)
    const integranteVinculado = await acceso.getPorAuthUser(user.id)
    const integrante = integranteVinculado ?? await acceso.getDesvinculadoPorEmail(email)
    const borrable = !integranteVinculado && esCuentaNuevaDeGoogle
    let invitacion: Awaited<ReturnType<typeof validarToken>> | null = null
    if (token) invitacion = await validarToken(admin, token)

    if (token && !invitacion?.valido) {
      await limpiar(borrable)
      return haciaLogin(request, 'google_error')
    }

    if (token && invitacion?.valido && invitacion.invitacion?.email.toLowerCase() !== email) {
      await limpiar(borrable)
      return haciaLogin(request, 'google_correo_distinto', invitacion.invitacion?.email)
    }

    if (integrante?.desvinculado_at) {
      await limpiar(borrable)
      return haciaLogin(request, 'desvinculado')
    }

    if (integrante?.activo) {
      // Un fallo al cerrar la invitación no expulsa a un integrante legítimo.
      try {
        if (token && invitacion?.valido) await marcarUsado(admin, token)
        if (!token) await marcarPendientesUsadasPorEmail(admin, email)
      } catch (errorInvitacion) {
        console.error('[auth/callback] no se pudo cerrar la invitación:', errorInvitacion)
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    await limpiar(borrable)
    // Integrante conocido pero inactivo (no desvinculado) no es "sin invitación".
    return haciaLogin(request, integrante ? 'sin_acceso' : 'google_sin_invitacion')
  } catch (error) {
    console.error('[auth/callback] error procesando OAuth:', error)
    await limpiar(false)
    return haciaLogin(request, 'google_error')
  }
}
