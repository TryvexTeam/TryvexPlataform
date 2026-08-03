'use client'

import { useState } from 'react'
import { PenSquareIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarChat } from './avatar-chat'
import type { IntegranteChat } from './chat-workspace'

interface NuevaConversacionProps {
  equipo: IntegranteChat[]
  miIntegranteId: string
  ocupado: boolean
  onCrear: (payload: { tipo: 'dm' | 'grupo'; nombre?: string; miembros: string[] }) => Promise<void>
}

export function NuevaConversacion({
  equipo,
  miIntegranteId,
  ocupado,
  onCrear,
}: NuevaConversacionProps) {
  const [abierto, setAbierto] = useState(false)
  const [elegidos, setElegidos] = useState<string[]>([])
  const [nombre, setNombre] = useState('')

  const otros = equipo.filter((i) => i.id !== miIntegranteId)
  const esGrupo = elegidos.length > 1

  const alternar = (id: string) => {
    setElegidos((previos) => (previos.includes(id) ? previos.filter((x) => x !== id) : [...previos, id]))
  }

  const confirmar = async () => {
    if (elegidos.length === 0) return
    await onCrear(
      esGrupo
        ? { tipo: 'grupo', nombre: nombre.trim() || `Grupo de ${elegidos.length + 1}`, miembros: elegidos }
        : { tipo: 'dm', miembros: elegidos },
    )
    setAbierto(false)
    setElegidos([])
    setNombre('')
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        aria-label="Nueva conversación"
        className="text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
      >
        <PenSquareIcon className="size-[18px]" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
          <DialogDescription>
            Elige una persona para un mensaje directo, o varias para armar un grupo.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
          {otros.map((i) => {
            const elegido = elegidos.includes(i.id)
            return (
              <button
                key={i.id}
                onClick={() => alternar(i.id)}
                aria-pressed={elegido}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors"
                style={{ background: elegido ? 'var(--tx-accent-subtle)' : 'transparent' }}
              >
                <AvatarChat nombre={i.nombre} avatarUrl={i.avatar_url} color={i.color} size={32} />
                <span className="text-[14px] text-[var(--tx-ink-primary)]">{i.nombre}</span>
              </button>
            )
          })}
        </div>

        {esGrupo && (
          <div className="space-y-1.5">
            <Label htmlFor="nombre-grupo">Nombre del grupo</Label>
            <Input
              id="nombre-grupo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Comercial, Producto, Turno tarde…"
              maxLength={80}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={elegidos.length === 0 || ocupado}>
            {esGrupo ? 'Crear grupo' : 'Abrir chat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
