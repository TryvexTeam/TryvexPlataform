import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Canje del link del correo. Se hace en el servidor, no en una página cliente, por
 * dos razones: el token nunca queda en el historial de navegación con una sesión ya
 * abierta, y la cookie de sesión se escribe antes de renderizar nada.
 *
 * El token es de un solo uso: si alguien reenvía el correo o lo intercepta después,
 * el segundo canje falla.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!tokenHash || type !== 'recovery') {
    return NextResponse.redirect(`${origin}/recuperar?error=link_invalido`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })

  if (error) {
    // Vencido, ya usado o manipulado: los tres se ven igual desde afuera a propósito.
    return NextResponse.redirect(`${origin}/recuperar?error=link_expirado`)
  }

  return NextResponse.redirect(`${origin}/nueva-password`)
}
