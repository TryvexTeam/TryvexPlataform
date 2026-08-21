'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Copy, Send } from 'lucide-react'

interface InvitacionFormProps {
  onCreada: () => void
}

export function InvitacionForm({ onCreada }: InvitacionFormProps) {
  const [email, setEmail] = useState('')
  const [enviarEmail, setEnviarEmail] = useState(true)
  const [loading, setLoading] = useState(false)
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null)
  const [pendienteAprobacion, setPendienteAprobacion] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setLinkGenerado(null)

    try {
      const res = await fetch('/api/invitaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, enviarEmail }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Error al crear invitación')
        return
      }

      setLinkGenerado(json.data.link)
      setPendienteAprobacion(Boolean(json.data.requiereAprobacion))
      setEmail('')
      onCreada()

      if (json.data.requiereAprobacion) {
        toast('Invitación creada, pendiente de aprobación', {
          description: 'Un superadmin tiene que aprobarla antes de que el link funcione',
        })
      } else if (enviarEmail) {
        toast.success(`Invitación enviada a ${email}`)
      } else {
        toast.success('Invitación generada')
      }
    } finally {
      setLoading(false)
    }
  }

  async function copiarLink() {
    if (!linkGenerado) return
    await navigator.clipboard.writeText(linkGenerado)
    toast.success('Link copiado al portapapeles')
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-email">Email del invitado</Label>
          <Input
            id="inv-email"
            type="email"
            placeholder="nombre@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="inv-send-email"
            checked={enviarEmail}
            onCheckedChange={setEnviarEmail}
          />
          <Label htmlFor="inv-send-email" className="cursor-pointer">
            Enviar por email
          </Label>
        </div>

        <Button type="submit" disabled={loading} className="w-full gap-2">
          <Send className="h-4 w-4" />
          {loading ? 'Generando...' : 'Generar invitación'}
        </Button>
      </form>

      {linkGenerado && (
        <div className="rounded-lg border border-[var(--tx-border)] bg-white/5 p-3 space-y-2">
          <p className="text-xs text-[var(--tx-ink-muted)] font-medium">
            Link de invitación (válido 30 min)
            {pendienteAprobacion && ' — todavía no funciona, esperando aprobación de un superadmin'}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white/5 border border-[var(--tx-border)] text-[var(--tx-ink-primary)] rounded px-2 py-1.5 truncate">
              {linkGenerado}
            </code>
            <Button size="sm" variant="outline" onClick={copiarLink} className="shrink-0 gap-1">
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
