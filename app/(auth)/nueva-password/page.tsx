'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { NuevaPasswordSchema, PASSWORD_MIN, passwordDemasiadoObvia } from '@/lib/types/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

/**
 * Solo se llega aquí con la sesión de recuperación ya abierta por /auth/confirmar.
 * Si alguien entra a mano sin esa sesión, no hay nada que cambiar y se le manda a
 * pedir el link de nuevo.
 */
export default function NuevaPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [verificando, setVerificando] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/recuperar?error=link_expirado')
        return
      }
      setVerificando(false)
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrores({})

    const parsed = NuevaPasswordSchema.safeParse({ password, confirmacion })
    if (!parsed.success) {
      const fe: Record<string, string> = {}
      parsed.error.issues.forEach((i) => { if (i.path[0]) fe[i.path[0] as string] = i.message })
      setErrores(fe)
      return
    }
    if (passwordDemasiadoObvia(password)) {
      setErrores({ password: 'Esa contraseña es demasiado fácil de adivinar' })
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('should be different') || msg.includes('same as')) {
        setErrores({ password: 'Elige una contraseña distinta de la anterior' })
      } else if (msg.includes('session') || msg.includes('jwt')) {
        toast.error('El link venció. Pide uno nuevo.')
        router.replace('/recuperar?error=link_expirado')
      } else {
        toast.error(error.message)
      }
      setLoading(false)
      return
    }

    // Cambiar la clave debe expulsar al intruso, no solo dejarlo fuera de la próxima
    // vez: se cierran todas las demás sesiones abiertas de esta cuenta.
    await supabase.auth.signOut({ scope: 'others' })

    toast.success('Contraseña actualizada. Vuelve a entrar.')
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  if (verificando) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Un momento</CardTitle>
          <CardDescription>Validando el link...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva contraseña</CardTitle>
        <CardDescription>
          Mínimo {PASSWORD_MIN} caracteres, con al menos una letra y un número.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña nueva</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrores((p) => ({ ...p, password: '' })) }}
              required
              autoComplete="new-password"
              autoFocus
            />
            {errores.password && <p className="text-xs text-red-500">{errores.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmacion">Repetir contraseña</Label>
            <Input
              id="confirmacion"
              type="password"
              value={confirmacion}
              onChange={(e) => { setConfirmacion(e.target.value); setErrores((p) => ({ ...p, confirmacion: '' })) }}
              required
              autoComplete="new-password"
            />
            {errores.confirmacion && <p className="text-xs text-red-500">{errores.confirmacion}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </Button>
          <p className="text-center text-sm text-neutral-500">
            <Link href="/login" className="text-neutral-900 font-medium hover:underline">
              Cancelar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
