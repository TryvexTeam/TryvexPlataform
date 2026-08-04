'use client'

import { useEffect, useRef, useState } from 'react'
import { SendIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import type { Conversacion, Mensaje, MiembroChat } from '@/lib/types/chat'
import { tituloConversacion } from '@/lib/types/chat'
import { Markdown } from '@/components/shared/markdown'
import { AvatarChat } from './avatar-chat'

interface HiloChatProps {
  conversacion: Conversacion
  miIntegranteId: string
  enLinea: Set<string>
  onMensajeEnviado?: (mensaje: Mensaje) => void
}

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

export function HiloChat({ conversacion, miIntegranteId, enLinea, onMensajeEnviado }: HiloChatProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const finRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLTextAreaElement>(null)

  const porId = new Map<string, MiembroChat>(conversacion.miembros.map((m) => [m.integrante_id, m]))
  const titulo = tituloConversacion(conversacion, miIntegranteId)
  const otro = conversacion.miembros.find((m) => m.integrante_id !== miIntegranteId)
  const activo = conversacion.tipo === 'dm' && otro ? enLinea.has(otro.integrante_id) : false

  // Historial al abrir el hilo.
  useEffect(() => {
    let vigente = true

    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return
        if (json.success) setMensajes(json.data as Mensaje[])
        else toast.error(json.error ?? 'No se pudieron cargar los mensajes')
      })
      .catch(() => vigente && toast.error('Error de red al cargar el chat'))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [conversacion.id])

  // Mensajes nuevos en vivo, sin recargar.
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`mensajes-${conversacion.id}`)
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
          // El propio ya se agregó al enviar: no duplicarlo.
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacion.id])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  /**
   * La caja crece con el texto. Con `rows={1}` fijo, un Shift+Enter metía el salto
   * pero la altura no cambiaba: la línea nueva empujaba a la anterior fuera de
   * vista y parecía que el texto desaparecía.
   *
   * Se baja a 'auto' antes de medir porque scrollHeight nunca decrece por sí solo:
   * sin eso la caja crecería y no volvería a achicarse al borrar.
   */
  useEffect(() => {
    const caja = cajaRef.current
    if (!caja) return
    caja.style.height = 'auto'
    caja.style.height = `${caja.scrollHeight}px`
  }, [borrador])

  const enviar = async () => {
    const contenido = borrador.trim()
    if (!contenido || enviando) return

    setEnviando(true)
    try {
      const res = await fetch('/api/chat/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: conversacion.id, contenido }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo enviar')

      const mensaje = json.data as Mensaje
      setMensajes((previos) => (previos.some((m) => m.id === mensaje.id) ? previos : [...previos, mensaje]))
      setBorrador('')
      onMensajeEnviado?.(mensaje)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error enviando el mensaje')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] shrink-0">
        <AvatarChat
          nombre={titulo}
          avatarUrl={otro?.avatar_url}
          color={otro?.color}
          enLinea={activo}
          size={36}
        />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--tx-ink-primary)] truncate">{titulo}</p>
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            {conversacion.tipo === 'grupo'
              ? `${conversacion.miembros.length} integrantes`
              : activo
                ? 'Activo ahora'
                : 'Desconectado'}
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
        {cargando ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">Cargando…</p>
        ) : mensajes.length === 0 ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">
            Todavía no hay mensajes. Escribe el primero.
          </p>
        ) : (
          mensajes.map((m, i) => {
            const mio = m.autor_id === miIntegranteId
            const autor = porId.get(m.autor_id)
            const encadenado = i > 0 && mensajes[i - 1].autor_id === m.autor_id

            return (
              <div key={m.id} className={`flex gap-2 ${mio ? 'justify-end' : 'justify-start'}`}>
                {!mio && conversacion.tipo === 'grupo' && (
                  <div className={encadenado ? 'w-7' : ''}>
                    {!encadenado && (
                      <AvatarChat
                        nombre={autor?.nombre ?? '?'}
                        avatarUrl={autor?.avatar_url}
                        color={autor?.color}
                        size={28}
                      />
                    )}
                  </div>
                )}

                <div className={`max-w-[68%] ${mio ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mio && conversacion.tipo === 'grupo' && !encadenado && (
                    <span className="text-[11px] text-[var(--tx-ink-muted)] px-1 mb-0.5">
                      {autor?.nombre ?? 'Sin nombre'}
                    </span>
                  )}
                  <div
                    className="px-3.5 py-2 text-[14px] leading-snug break-words"
                    style={{
                      borderRadius: 18,
                      background: mio ? 'var(--tx-accent)' : 'rgba(255,255,255,0.06)',
                      color: mio ? 'var(--tx-accent-fg)' : 'var(--tx-ink-primary)',
                    }}
                  >
                    {/* heredaColor: el mensaje propio va sobre el acento y el markdown
                        no puede imponer el suyo o quedaría ilegible. */}
                    <Markdown heredaColor className="text-[14px]">
                      {m.contenido}
                    </Markdown>
                  </div>
                  <span className="text-[10px] text-[var(--tx-ink-muted)] px-1 mt-0.5">
                    {HORA.format(new Date(m.created_at))}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={finRef} />
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <div
          className="flex items-end gap-2 rounded-full px-4 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
        >
          <textarea
            ref={cajaRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
            rows={1}
            placeholder="Escribe un mensaje…"
            aria-label="Escribe un mensaje"
            className="flex-1 bg-transparent resize-none outline-none text-[14px] text-[var(--tx-ink-primary)] max-h-40 overflow-y-auto"
          />
          <button
            onClick={enviar}
            disabled={!borrador.trim() || enviando}
            aria-label="Enviar mensaje"
            className="shrink-0 disabled:opacity-40 text-[var(--tx-accent)]"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
