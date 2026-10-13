'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'

type BotonGoogleProps = { loginHint?: string; invitacion?: string; texto?: string }

export function BotonGoogle({ loginHint, invitacion, texto = 'Continuar con Google' }: BotonGoogleProps) {
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    setCargando(true)
    const origen = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const callback = new URL('/auth/callback', origen)
    if (invitacion) callback.searchParams.set('invitacion', invitacion)
    const queryParams: Record<string, string> = { prompt: 'select_account' }
    if (loginHint) queryParams.login_hint = loginHint
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: callback.toString(), queryParams },
    })
    if (error) {
      toast.error('No se pudo iniciar sesión con Google', { description: error.message })
      setCargando(false)
    }
  }

  return (
    <Button type="button" variant="outline" className="w-full" disabled={cargando} onClick={entrar}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.75 3.27-8.1Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.94-6.16-4.54H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.94l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.2 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1a11 11 0 0 0-9.82 6.06L5.84 9.9C6.71 7.3 9.14 5.36 12 5.36Z" />
      </svg>
      {cargando ? 'Conectando…' : texto}
    </Button>
  )
}
