'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, ChevronDown } from 'lucide-react'
import { TarjetaBorrador } from './tarjeta-borrador'

export type DraftLead = {
  lead_id: string
  nombre: string
  telefono: string | null
  whatsapp: { text: string; link: string | null } | null
  social: { text: string } | null
  aviso?: string
}

interface VexTurno {
  rol: 'user' | 'vex'
  texto: string
  created_at?: string
}

interface Mensaje extends VexTurno {
  id: string
  borradores?: DraftLead[]
}

interface VexChatProps {
  historialInicial: VexTurno[]
}

function toMensaje(t: VexTurno, idx: number): Mensaje {
  return { ...t, id: `hist-${idx}-${t.created_at ?? idx}` }
}

export function VexChat({ historialInicial }: VexChatProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => historialInicial.map(toMensaje))
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [mensajes, pensando])

  const enviar = async () => {
    const mensaje = input.trim()
    if (!mensaje || pensando) return
    setError(null)
    setInput('')
    setMensajes((prev) => [...prev, { id: `local-${Date.now()}`, rol: 'user', texto: mensaje }])
    setPensando(true)
    try {
      const res = await fetch('/api/vex/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setError(data?.error || 'Vex no pudo responder. Intenta de nuevo.')
        return
      }
      setMensajes((prev) => [
        ...prev,
        {
          id: `vex-${Date.now()}`,
          rol: 'vex',
          texto: data.respuesta ?? 'Listo.',
          borradores: data.borradores,
        },
      ])
    } catch {
      setError('Error de red al hablar con Vex.')
    } finally {
      setPensando(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <section className="glass reader flex-1 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="reader__meta" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 18 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg,#FF8A5B,#8B5CF6)',
            display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
          }}
        >
          <Bot size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="reader__from truncate">Vex</div>
          <div className="reader__to">scraper-clientes</div>
        </div>
        <button
          type="button"
          disabled
          title="Más agentes pronto"
          className="reader__hint cursor-not-allowed opacity-70"
          style={{ marginLeft: 'auto' }}
        >
          <span>scraper-clientes</span>
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Thread */}
      <div ref={threadRef} className="reader__thread flex-1 overflow-y-auto">
        {mensajes.length === 0 && (
          <div className="text-center py-6 text-[12px] text-[var(--tx-ink-muted)] border-t border-dashed border-white/[0.04]">
            Hablá con Vex: pedile un reporte de cartera, que te recomiende leads, o que prepare un envío.
          </div>
        )}
        {mensajes.map((m) => (
          <article key={m.id} className={`msg ${m.rol === 'user' ? 'msg--out' : ''}`}>
            <header className="msg__head">
              <strong>{m.rol === 'user' ? 'Tú' : 'Vex'}</strong>
              {m.created_at && (
                <span className="msg__when">
                  {new Date(m.created_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </header>
            <div className="msg__body">
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</p>
            </div>
            {m.borradores && m.borradores.length > 0 && (
              <div className="flex flex-col gap-3 mt-3">
                {m.borradores.map((b) => (
                  <TarjetaBorrador key={b.lead_id} borrador={b} />
                ))}
              </div>
            )}
          </article>
        ))}

        {pensando && (
          <article className="msg">
            <header className="msg__head">
              <strong>Vex</strong>
            </header>
            <div className="msg__body flex items-center gap-2 text-[var(--tx-ink-muted)]">
              <Loader2 size={13} className="animate-spin" />
              <span>Vex está pensando…</span>
            </div>
          </article>
        )}

        {error && (
          <div className="text-[12px] text-red-400 border border-red-500/20 bg-red-500/5 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="reply flex items-end gap-2 mt-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escribile a Vex…"
          rows={1}
          disabled={pensando}
          className="flex-1 resize-none rounded-xl px-3 py-2 text-[13px] bg-white/[0.03] border border-white/[0.08] text-[var(--tx-ink-primary)] placeholder:text-[var(--tx-ink-muted)] focus:outline-none focus:border-[var(--tx-accent)]/50"
        />
        <button
          onClick={enviar}
          disabled={pensando || !input.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border border-[var(--tx-accent)]/20 bg-[var(--tx-accent)]/10 hover:bg-[var(--tx-accent)]/20 text-[var(--tx-accent)] transition-colors disabled:opacity-40"
        >
          {pensando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          <span>Enviar</span>
        </button>
      </div>
    </section>
  )
}
