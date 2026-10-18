'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Loader2, MessageSquare, RefreshCw, User } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { ConversacionAgente, ModoConversacion } from '@/lib/vex/agente'

/**
 * Las conversaciones que atiende el agente, con el interruptor por hilo.
 *
 * El modo es por conversación, no global: se puede tomar el control de un lead
 * delicado sin callar al agente con el resto. Y el agente lo cambia solo a
 * `HUMAN` cuando alguien escribe a mano desde el teléfono vinculado, para no
 * pisar lo que esa persona está diciendo.
 */

const REFRESCO_MS = 20000

interface PanelConversacionesProps {
  inicial: ConversacionAgente[]
}

export function PanelConversaciones({ inicial }: PanelConversacionesProps) {
  const [conversaciones, setConversaciones] = useState(inicial)
  const [cambiando, setCambiando] = useState<number | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async (conSpinner = false) => {
    if (conSpinner) setRefrescando(true)
    try {
      const res = await fetch('/api/vex/agente/conversaciones', { cache: 'no-store' })
      const cuerpo = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(cuerpo.data)) setConversaciones(cuerpo.data)
    } catch {
      // El polling no molesta con errores: la vista sigue mostrando lo último
      // bueno que tuvo, que es más útil que vaciarse.
    } finally {
      setRefrescando(false)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => cargar(), REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const cambiarModo = useCallback(
    async (conversacion: number, modo: ModoConversacion) => {
      setCambiando(conversacion)

      // Optimista: el interruptor responde al toque y se revierte si falla.
      const previo = conversaciones
      setConversaciones((cs) =>
        cs.map((c) => (c.id === conversacion ? { ...c, mode: modo } : c))
      )

      try {
        const res = await fetch('/api/vex/agente/modo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversacion, modo }),
        })
        const cuerpo = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(cuerpo?.error ?? `no se pudo cambiar (${res.status})`)

        toast.success(modo === 'HUMAN' ? 'Tomaste el control' : 'El agente vuelve a responder')
      } catch (error: unknown) {
        setConversaciones(previo)
        toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el modo')
      } finally {
        setCambiando(null)
      }
    },
    [conversaciones]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversaciones</CardTitle>
        <CardDescription>
          Apagá el agente en un hilo para responder vos, sin callarlo con el resto.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => cargar(true)}
            disabled={refrescando}
            aria-label="Actualizar conversaciones"
          >
            <RefreshCw size={13} className={cn(refrescando && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {conversaciones.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-lg py-10 text-center"
            style={{ border: '1px dashed var(--tx-border)' }}
          >
            <MessageSquare size={20} className="text-[var(--tx-ink-muted)]" />
            <p className="text-sm text-[var(--tx-ink-secondary)]">Todavía no hay conversaciones</p>
            <p className="text-xs text-[var(--tx-ink-muted)] max-w-xs">
              Aparecen acá cuando un lead responde al primer mensaje que le manda el equipo.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {conversaciones.map((c) => (
              <Fila
                key={c.id}
                conversacion={c}
                cambiando={cambiando === c.id}
                onCambiar={cambiarModo}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface FilaProps {
  conversacion: ConversacionAgente
  cambiando: boolean
  onCambiar: (id: number, modo: ModoConversacion) => void
}

function Fila({ conversacion, cambiando, onCambiar }: FilaProps) {
  const enManosDelAgente = conversacion.mode === 'AI'

  return (
    <li
      className="flex items-center justify-between gap-4 py-3"
      style={{ borderBottom: '1px solid var(--tx-border)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--tx-ink-primary)] truncate">
          {conversacion.name?.trim() || conversacion.phone}
        </p>
        <p className="text-xs text-[var(--tx-ink-muted)] tabular-nums">
          {conversacion.name?.trim() ? `${conversacion.phone} · ` : ''}
          {formatearMomento(conversacion.last_message_at)}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={enManosDelAgente ? 'secondary' : 'outline'} className="gap-1">
          {enManosDelAgente ? <Bot size={12} /> : <User size={12} />}
          {enManosDelAgente ? 'Vex' : 'Vos'}
        </Badge>
        {cambiando ? (
          <Loader2 size={16} className="animate-spin text-[var(--tx-ink-muted)]" />
        ) : (
          <Switch
            checked={enManosDelAgente}
            onCheckedChange={(activo) => onCambiar(conversacion.id, activo ? 'AI' : 'HUMAN')}
            aria-label={`Respuesta automática con ${conversacion.name?.trim() || conversacion.phone}`}
          />
        )}
      </div>
    </li>
  )
}

/** Momento del último mensaje en lenguaje de persona, no en marca de tiempo. */
function formatearMomento(segundos: number | null): string {
  if (!segundos) return 'sin mensajes'

  const minutos = Math.floor((Date.now() - segundos * 1000) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`

  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`

  return new Date(segundos * 1000).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
