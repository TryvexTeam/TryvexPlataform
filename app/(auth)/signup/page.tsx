'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const SignupSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [tokenValido, setTokenValido] = useState<boolean | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setTokenValido(false)
      setTokenError('Se requiere una invitación válida para registrarse.')
      return
    }

    fetch(`/api/invitaciones/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setTokenValido(true)
          setForm((prev) => ({ ...prev, email: json.data.email }))
        } else {
          setTokenValido(false)
          setTokenError(json.error ?? 'Invitación inválida')
        }
      })
      .catch(() => {
        setTokenValido(false)
        setTokenError('No se pudo verificar la invitación.')
      })
  }, [token])

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const result = SignupSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message
      })
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    const supabase = createClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${appUrl}/login`,
      },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        toast.error('Este email ya tiene una cuenta. Inicia sesión.')
      } else {
        toast.error('Error al registrarse. Intenta de nuevo.')
      }
      setLoading(false)
      return
    }

    // Marcar token como usado
    await fetch(`/api/invitaciones/${token}`, { method: 'PATCH' })

    toast.success('¡Cuenta creada! Confirma tu email y luego inicia sesión.', { duration: 6000 })
    router.push('/login')
  }

  if (tokenValido === null) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-center text-neutral-400">Verificando invitación...</p>
        </CardContent>
      </Card>
    )
  }

  if (tokenValido === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitación inválida</CardTitle>
          <CardDescription>{tokenError}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            Contacta a tu administrador para obtener una nueva invitación.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Completa tu registro con la invitación recibida</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              readOnly
              className="bg-neutral-50 cursor-not-allowed"
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              autoComplete="new-password"
            />
            {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repetir contraseña"
              value={form.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              autoComplete="new-password"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500">{errors.confirmPassword}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Registrarme'}
          </Button>
          <p className="text-center text-sm text-neutral-500">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-neutral-900 font-medium hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-center text-neutral-400">Cargando...</p>
        </CardContent>
      </Card>
    }>
      <SignupForm />
    </Suspense>
  )
}
