'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AuthProvider({
  children,
  bypass = false,
}: {
  children: React.ReactNode
  /**
   * Desarrollo con `BYPASS_AUTH`: no hay sesión de Supabase en el navegador y
   * no debe haberla.
   *
   * Sin esto, un token viejo en el navegador emite `SIGNED_OUT` al arrancar,
   * esto empuja a `/login`, y el middleware —que con el atajo ve un usuario
   * válido— rebota al panel. Resultado: cualquier pantalla que uno intente
   * abrir salta al dashboard en menos de un segundo, y parece que la pantalla
   * está rota cuando lo que falla es el atajo.
   */
  bypass?: boolean
}) {
  const router = useRouter()

  useEffect(() => {
    if (bypass) return

    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        // Sincroniza el nuevo token con el servidor (actualiza las cookies SSR)
        router.refresh()
      }

      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router, bypass])

  return <>{children}</>
}
