'use client'

import { useEffect, useRef, useState } from 'react'
import { SendIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import type { Mensaje } from '@/lib/types/chat'

interface ChatLlamadaProps {
  conversacionId: string
  miIntegranteId: string
  nombrePorId: Map<string, string>
  onCerrar: () => void
  /**
   * Interpreta una línea que empieza con `/` como comando de música y devuelve
   * qué contestar en pantalla. Si no está, los comandos se mandan como mensajes.
   */
  onComando?: (linea: string) => Promise<string>
}

/** Ver `use-datos-vivos`: supabase-js cachea canales por nombre. */
let contadorCanal = 0

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

/**
 * El chat de la llamada. No es un chat aparte: escribe en la misma conversación
 * del hilo, con los mismos endpoints.
 *
 * Que sea el mismo y no uno efímero es deliberado. En una llamada se pegan links
 * y se dictan IDs, y eso es justo lo que uno vuelve a buscar al día siguiente. Un
 * chat que se borra al colgar pierde lo único que valía la pena guardar.
 */
export function ChatLlamada({
  conversacionId,
  miIntegranteId,
  nombrePorId,
  onCerrar,
  onComando,
}: ChatLlamadaProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  /**
   * La respuesta del último comando de música.
   *
   * Va en el panel y NO en el hilo a propósito: "En cola: Bohemian Rhapsody" le
   * importa a quien lo escribió y en ese momento. Publicarlo dejaría la
   * conversación llena de acuses de recibo que mañana no le sirven a nadie.
   */
  const [respuestaComando, setRespuestaComando] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vigente = true

    fetch(`/api/chat/mensajes?conversacion=${conversacionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente || !json.success) return
        // Los últimos 30: en una llamada nadie se pone a leer el historial, y
        // montar cien burbujas encima del video cuesta caro en el teléfono.
        setMensajes((json.data as Mensaje[]).slice(-30))
      })
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [conversacionId])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`chat-llamada-${++contadorCanal}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacionId])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  const enviar = async () => {
    const contenido = borrador.trim()
    if (!contenido || enviando) return

    /**
     * Una línea que empieza con `/` es un comando, no un mensaje.
     *
     * Se corta acá y no se manda al hilo. Es lo que evita que un `/plya` mal
     * escrito quede para siempre en la conversación: si el comando no existe se
     * avisa en pantalla, pero tampoco se publica.
     */
    if (onComando && contenido.startsWith('/')) {
      setBorrador('')
      setEnviando(true)
      try {
        setRespuestaComando(await onComando(contenido))
      } catch (err) {
        setRespuestaComando(err instanceof Error ? err.message : 'No se pudo ejecutar el comando')
      } finally {
        setEnviando(false)
      }
      return
    }

    setEnviando(true)
    try {
      const res = await fetch('/api/chat/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: conversacionId, contenido }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo enviar')

      const mensaje = json.data as Mensaje
      setMensajes((previos) => (previos.some((m) => m.id === mensaje.id) ? previos : [...previos, mensaje]))
      setBorrador('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error enviando el mensaje')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <aside
      className="flex flex-col min-h-0 w-full md:w-[320px] shrink-0"
      style={{ borderLeft: '1px solid var(--tx-border)' }}
      aria-label="Chat de la llamada"
    >
      <header className="flex items-center justify-between px-3 py-2.5 shrink-0"
              style={{ borderBottom: '1px solid var(--tx-border)' }}>
        <p className="text-[13px] font-semibold text-[var(--tx-ink-primary)]">Chat</p>
        <button
          onClick={onCerrar}
          aria-label="Cerrar el chat"
          className="p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {mensajes.length === 0 && (
          <p className="text-[12px] text-[var(--tx-ink-muted)] py-4">
            Lo que escriban acá queda en la conversación después de colgar.
          </p>
        )}

        {mensajes.map((m) => {
          const mio = m.autor_id === miIntegranteId
          return (
            <div key={m.id} className={mio ? 'text-right' : ''}>
              {!mio && (
                <p className="text-[11px] text-[var(--tx-ink-muted)] mb-0.5">
                  {nombrePorId.get(m.autor_id ?? '') ?? 'Alguien'}
                </p>
              )}
              <div
                className="inline-block max-w-[85%] rounded-xl px-2.5 py-1.5 text-left"
                style={{
                  background: mio ? 'var(--tx-accent)' : 'oklch(100% 0 0 / 8%)',
                  color: mio ? 'var(--tx-accent-fg)' : 'var(--tx-ink-primary)',
                }}
              >
                {/* Texto plano a propósito: el markdown del hilo trae su propio
                    renderizador y acá lo que se manda son links y códigos cortos. */}
                <p className="text-[13px] whitespace-pre-wrap break-words">{m.contenido}</p>
                <p className="text-[10px] opacity-60 mt-0.5">{HORA.format(new Date(m.created_at))}</p>
              </div>
            </div>
          )
        })}
        <div ref={finRef} />
      </div>

      {/* La respuesta del comando, solo para quien lo escribió. */}
      {respuestaComando && (
        <p
          role="status"
          className="mx-2 mb-1 shrink-0 rounded-lg px-2.5 py-1.5 text-[11px]"
          style={{ background: 'oklch(100% 0 0 / 6%)', color: 'var(--tx-ink-muted)' }}
        >
          {respuestaComando}
        </p>
      )}

      <div className="flex items-end gap-2 p-2 shrink-0" style={{ borderTop: '1px solid var(--tx-border)' }}>
        <textarea
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
          rows={1}
          placeholder={onComando ? 'Escribe… o /play para música' : 'Escribe…'}
          className="flex-1 resize-none rounded-lg px-2.5 py-2 text-[13px] outline-none"
          style={{
            background: 'oklch(100% 0 0 / 6%)',
            color: 'var(--tx-ink-primary)',
            maxHeight: 96,
          }}
        />
        <button
          onClick={() => void enviar()}
          disabled={!borrador.trim() || enviando}
          aria-label="Enviar"
          className="inline-flex size-9 items-center justify-center rounded-lg disabled:opacity-40"
          style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
        >
          <SendIcon className="size-4" />
        </button>
      </div>
    </aside>
  )
}
