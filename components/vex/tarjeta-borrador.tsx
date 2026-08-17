'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Trash2, Loader2, XCircle, MessageCircle } from 'lucide-react'
import type { DraftLead } from './vex-chat'

interface TarjetaBorradorProps {
  borrador: DraftLead
}

type Estado =
  | { tipo: 'idle' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'descartado' }

export function TarjetaBorrador({ borrador }: TarjetaBorradorProps) {
  const router = useRouter()
  const [texto, setTexto] = useState(borrador.whatsapp?.text ?? '')
  const [estado, setEstado] = useState<Estado>({ tipo: 'idle' })
  const [abriendo, setAbriendo] = useState(false)

  /**
   * Lleva este mensaje al chat del lead, dentro del CRM.
   *
   * Es el camino que pidio Cristian: pedirle los mensajes a Vex en su chat y
   * que un boton lleve al chat de cada uno con el texto ya escrito. El texto no
   * viaja por la URL —se rompe con saltos de linea y no sobrevive a recargar—:
   * se guarda como borrador del lead y el chat lo levanta de ahi.
   */
  const abrirEnElChat = async () => {
    setAbriendo(true)
    try {
      const r = await fetch(`/api/leads/${borrador.lead_id}/borrador`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto.trim() }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setEstado({ tipo: 'error', mensaje: d?.error ?? 'No se pudo dejar el borrador en el chat.' })
        return
      }
      // `chat=1` para que el modal se abra solo al llegar: si aterrizas en la
      // ficha y tenes que buscar el boton de WhatsApp, el atajo no sirve de nada.
      router.push(`/leads?lead=${borrador.lead_id}&chat=1`)
    } catch {
      setEstado({ tipo: 'error', mensaje: 'Error de red al dejar el borrador.' })
    } finally {
      setAbriendo(false)
    }
  }

  if (estado.tipo === 'descartado') return null

  const sinCanal = !borrador.whatsapp


  const yaTermino = estado.tipo === 'error'

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[var(--tx-ink-primary)] truncate">{borrador.nombre}</div>
          {borrador.telefono && (
            <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--tx-ink-muted)]">
              <Phone size={11} />
              <span>{borrador.telefono}</span>
            </div>
          )}
        </div>
      </div>

      {borrador.aviso && (
        <p className="text-[12px] text-amber-400">{borrador.aviso}</p>
      )}

      {!sinCanal && (
        <>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={yaTermino}
            rows={4}
            className="w-full resize-none rounded-xl px-3 py-2 text-[12.5px] leading-relaxed bg-black/15 border border-white/[0.06] text-[var(--tx-ink-primary)] focus:outline-none focus:border-[var(--tx-accent)]/50 disabled:opacity-60"
          />

          {estado.tipo === 'error' && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-400">
              <XCircle size={13} />
              <span>❌ {estado.mensaje}</span>
            </div>
          )}

          {!yaTermino && (
            <div className="flex items-center gap-2">
              <button
                onClick={abrirEnElChat}
                disabled={abriendo || !texto.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border border-green-500/20 bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-40"
              >
                {abriendo ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
                <span>Abrir en el chat</span>
              </button>
              <button
                onClick={() => setEstado({ tipo: 'descartado' })}
                disabled={abriendo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border border-red-500/15 bg-red-500/5 hover:bg-red-500/15 text-red-400 transition-colors disabled:opacity-40 ml-auto"
              >
                <Trash2 size={12} />
                <span>Descartar</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
