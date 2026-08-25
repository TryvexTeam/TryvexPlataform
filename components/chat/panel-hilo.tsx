'use client'

import { useEffect, useRef, useState } from 'react'
import { SendIcon, XIcon } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { Markdown } from '@/components/shared/markdown'
import type { Conversacion, Mensaje, MiembroChat } from '@/lib/types/chat'
import { AvatarChat } from './avatar-chat'
import { AdjuntosMensaje } from './adjuntos-mensaje'

interface PanelHiloProps {
  conversacion: Conversacion
  padre: Mensaje
  miembros: Map<string, MiembroChat>
  onCerrar: () => void
  /** Para que el flujo principal actualice su contador de respuestas. */
  onRespondido: (padreId: string) => void
}

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

/**
 * Las respuestas colgadas de un mensaje, en un panel al costado.
 *
 * Un hilo saca la conversación paralela del flujo principal: sin esto, discutir
 * un punto puntual entierra todo lo demás. Un solo nivel de anidamiento, como
 * Slack — el trigger de la 026 lo garantiza también en la base.
 */
export function PanelHilo({ conversacion, padre, miembros, onCerrar, onRespondido }: PanelHiloProps) {
  const [respuestas, setRespuestas] = useState<Mensaje[]>([])
  const [borrador, setBorrador] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  // Volver a mostrar "Cargando..." al cambiar de hilo sin desmontar el panel.
  // Ajustar el estado durante el render (no en un efecto) al detectar el cambio
  // es el patrón que React recomienda para esto -- ver "Adjusting state when a
  // prop changes" en react.dev.
  const [padreIdPrevio, setPadreIdPrevio] = useState(padre.id)
  if (padreIdPrevio !== padre.id) {
    setPadreIdPrevio(padre.id)
    setCargando(true)
  }

  useEffect(() => {
    let vigente = true

    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}&hilo=${padre.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return
        if (json.success) setRespuestas(json.data as Mensaje[])
        else toast.error(json.error ?? 'No se pudo abrir el hilo')
      })
      .catch(() => vigente && toast.error('Error de red al abrir el hilo'))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [conversacion.id, padre.id])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [respuestas.length])

  // Sin esto, una respuesta de otra persona en este mismo hilo no aparecía
  // hasta cerrar y reabrir el panel: a diferencia del flujo principal
  // (hilo-chat.tsx), este componente no tenía ninguna suscripción realtime.
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`hilo-${padre.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          if (nuevo.hilo_padre !== padre.id) return
          setRespuestas((previas) => (previas.some((r) => r.id === nuevo.id) ? previas : [...previas, nuevo]))
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const actualizado = payload.new as Mensaje
          if (actualizado.hilo_padre !== padre.id) return
          setRespuestas((previas) => previas.map((r) => (r.id === actualizado.id ? { ...r, ...actualizado } : r)))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacion.id, padre.id])

  const responder = async () => {
    const contenido = borrador.trim()
    if (!contenido || enviando) return

    setEnviando(true)
    try {
      const res = await fetch('/api/chat/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: conversacion.id, contenido, hilo_padre: padre.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo responder')

      setRespuestas((previas) => [...previas, json.data as Mensaje])
      setBorrador('')
      onRespondido(padre.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error respondiendo')
    } finally {
      setEnviando(false)
    }
  }

  const autorDe = (m: Mensaje) => (m.autor_id ? miembros.get(m.autor_id) : undefined)

  return (
    // En un teléfono ocupa la pantalla; en escritorio es una columna al costado.
    <aside
      className="fixed inset-0 z-40 flex flex-col md:static md:inset-auto md:w-[340px] md:shrink-0"
      style={{ background: 'var(--tx-bg-primary)', borderLeft: '1px solid var(--border)' }}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0 pt-safe">
        <h2 className="text-[15px] font-semibold text-[var(--tx-ink-primary)]">Hilo</h2>
        <button
          onClick={onCerrar}
          aria-label="Cerrar hilo"
          className="p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
        >
          <XIcon className="size-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {/* El mensaje que abrió el hilo, arriba de todo: es el contexto. */}
        <div className="pb-3 border-b border-[var(--border)]">
          <Encabezado autor={autorDe(padre)} fecha={padre.created_at} />
          {padre.adjuntos && padre.adjuntos.length > 0 && <AdjuntosMensaje adjuntos={padre.adjuntos} />}
          {padre.contenido && (
            <Markdown chat className="text-[13px] mt-1">
              {padre.contenido}
            </Markdown>
          )}
        </div>

        {cargando ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">Cargando…</p>
        ) : respuestas.length === 0 ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">
            Todavía nadie respondió. Escribe la primera.
          </p>
        ) : (
          respuestas.map((r) => (
            <div key={r.id}>
              <Encabezado autor={autorDe(r)} fecha={r.created_at} />
              {r.adjuntos && r.adjuntos.length > 0 && <AdjuntosMensaje adjuntos={r.adjuntos} />}
              {r.eliminado_at ? (
                <span className="text-[13px] italic text-[var(--tx-ink-muted)]">Mensaje eliminado</span>
              ) : (
                r.contenido && (
                  <Markdown chat className="text-[13px] mt-0.5">
                    {r.contenido}
                  </Markdown>
                )
              )}
            </div>
          ))
        )}
        <div ref={finRef} />
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3 pb-safe">
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
        >
          <textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                responder()
              }
            }}
            rows={1}
            placeholder="Responder en el hilo…"
            aria-label="Responder en el hilo"
            className="flex-1 bg-transparent resize-none outline-none text-base sm:text-[14px] text-[var(--tx-ink-primary)] max-h-32"
          />
          <button
            onClick={responder}
            disabled={!borrador.trim() || enviando}
            aria-label="Enviar respuesta"
            className="shrink-0 disabled:opacity-40 text-[var(--tx-accent)]"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function Encabezado({ autor, fecha }: { autor: MiembroChat | undefined; fecha: string }) {
  return (
    <div className="flex items-center gap-2 mb-0.5">
      <AvatarChat nombre={autor?.nombre ?? '?'} avatarUrl={autor?.avatar_url} color={autor?.color} size={20} />
      <span className="text-[12px] font-medium text-[var(--tx-ink-primary)]">
        {autor?.nombre ?? 'Sin nombre'}
      </span>
      <span className="text-[10px] text-[var(--tx-ink-muted)]">{HORA.format(new Date(fecha))}</span>
    </div>
  )
}
