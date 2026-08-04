'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { RecuperarPasswordSchema } from '@/lib/types/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const ERRORES: Record<string, string> = {
  link_invalido: 'Ese link no es válido. Pide uno nuevo.',
  link_expirado: 'El link venció o ya se usó. Pide uno nuevo.',
}

// useSearchParams obliga a un límite de Suspense para que la página pueda prerenderizarse.
export default function RecuperarPage() {
  return (
    <Suspense fallback={<Card><CardHeader><CardTitle>Recuperar contraseña</CardTitle></CardHeader></Card>}>
      <RecuperarForm />
    </Suspense>
  )
}

function RecuperarForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    const err = params.get('error')
    if (err && ERRORES[err]) toast.error(ERRORES[err])
  }, [params])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsed = RecuperarPasswordSchema.safeParse({ email })
    if (!parsed.success) {
      toast.error('Revisa el correo que escribiste')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const json = await res.json()

      if (res.status === 429) {
        toast.error(json.error ?? 'Demasiados intentos')
        return
      }
      if (!res.ok) {
        toast.error(json.error ?? 'No se pudo enviar el correo')
        return
      }

      // Éxito y "ese correo no existe" se ven igual: es intencional.
      setEnviado(true)
    } catch {
      toast.error('No se pudo conectar. Revisa tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>
            Si <span className="font-medium">{email}</span> corresponde a una cuenta de Tryvex,
            te llegará un link para crear una contraseña nueva. Vence en una hora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-500">
            ¿No llega? Mira la carpeta de spam antes de volver a pedirlo.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setEnviado(false)}>
            Usar otro correo
          </Button>
          <p className="text-center text-sm text-neutral-500">
            <Link href="/login" className="text-neutral-900 font-medium hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>Te enviamos un link para crear una nueva</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email de tu cuenta</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviarme el link'}
          </Button>
          <p className="text-center text-sm text-neutral-500">
            <Link href="/login" className="text-neutral-900 font-medium hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
