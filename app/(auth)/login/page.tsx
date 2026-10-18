'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { BotonGoogle } from '@/components/auth/boton-google'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const motivo = searchParams.get('motivo')
    const esperadoCrudo = searchParams.get('esperado')
    const esperado = esperadoCrudo && z.string().email().safeParse(esperadoCrudo).success ? esperadoCrudo : null
    const mensajes: Record<string, string> = {
      google_sin_invitacion: 'Esa cuenta de Google no tiene invitación a Tryvex. Usa el correo con el que te invitaron.',
      google_correo_distinto: `La cuenta de Google no coincide con la invitación${esperado ? ` para ${esperado}` : ''}.`,
      desvinculado: 'Tu cuenta fue desvinculada de Tryvex. Contacta al administrador si necesitas volver.',
      sin_acceso: 'Tu cuenta no tiene acceso activo a Tryvex.',
      google_error: 'No se pudo completar el acceso con Google. Intenta nuevamente.',
    }
    if (motivo && mensajes[motivo]) toast.error(mensajes[motivo])
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        toast.error('Email o contraseña incorrectos')
      } else if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        toast.error('Debes confirmar tu email antes de entrar. Revisa tu bandeja de entrada.')
      } else {
        toast.error(`Error: ${error.message}`)
      }
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main>
      <Card>
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">Iniciar sesión</h1>
        <CardDescription>Ingresa tus credenciales para acceder</CardDescription>
      </CardHeader>
      <CardContent>
        <BotonGoogle />
        <div className="my-4 flex items-center gap-3 text-xs text-neutral-500" aria-hidden="true">
          <span className="h-px flex-1 bg-neutral-200" /><span>o con tu correo</span><span className="h-px flex-1 bg-neutral-200" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
          <p className="text-center text-sm">
            <Link href="/recuperar" className="text-neutral-400 hover:text-neutral-900 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          <p className="text-center text-sm text-neutral-500">
            ¿No tienes cuenta?{' '}
            <Link href="/signup" className="text-neutral-900 font-medium hover:underline">
              Registrarme
            </Link>
          </p>
        </form>
      </CardContent>
      </Card>
    </main>
  )
}

export default function LoginPage() {
  return <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}><LoginForm /></Suspense>
}
