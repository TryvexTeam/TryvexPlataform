'use client'

import { useState } from 'react'
import { Phone, Send, Eye, Trash2, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import type { DraftLead } from './vex-chat'

interface TarjetaBorradorProps {
  borrador: DraftLead
}

type Estado =
  | { tipo: 'idle' }
  | { tipo: 'simulando' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado'; advertencia?: string }
  | { tipo: 'manual' }
  | { tipo: 'ya_contactado' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'descartado' }

export function TarjetaBorrador({ borrador }: TarjetaBorradorProps) {
  const [texto, setTexto] = useState(borrador.whatsapp?.text ?? '')
  const [estado, setEstado] = useState<Estado>({ tipo: 'idle' })

  if (estado.tipo === 'descartado') return null

  const sinCanal = !borrador.whatsapp

  const simular = () => setEstado({ tipo: 'simulando' })

  const aprobarYEnviar = async () => {
    setEstado({ tipo: 'enviando' })
    try {
      const res = await fetch('/api/vex/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: borrador.lead_id, texto, confirmar: true }),
      })
      const data = await res.json().catch(() => null)

      if (res.status === 409) {
        setEstado({ tipo: 'ya_contactado' })
        return
      }
      if (!res.ok || !data || data.ok === false) {
        setEstado({ tipo: 'error', mensaje: data?.error || 'Error desconocido al enviar.' })
        return
      }
      if (data.fallback) {
        window.open(data.link, '_blank', 'noopener,noreferrer')
        setEstado({ tipo: 'manual' })
        return
      }
      setEstado({ tipo: 'enviado', advertencia: data.advertencia })
    } catch {
      setEstado({ tipo: 'error', mensaje: 'Error de red al enviar.' })
    }
  }

  const numeroWa = borrador.whatsapp?.link?.match(/wa\.me\/(\d+)/)?.[1] ?? borrador.telefono?.replace(/\D/g, '') ?? ''
  const linkSimulado = numeroWa ? `https://wa.me/${numeroWa}?text=${encodeURIComponent(texto)}` : null

  const enviando = estado.tipo === 'enviando'
  const yaTermino = ['enviado', 'manual', 'ya_contactado', 'error'].includes(estado.tipo)

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

          {estado.tipo === 'simulando' && linkSimulado && (
            <div className="text-[12px] rounded-xl p-3 bg-black/20 border border-white/[0.06] flex flex-col gap-1.5">
              <span className="text-[var(--tx-ink-muted)]">Se enviaría esto por WhatsApp:</span>
              <a
                href={linkSimulado}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--tx-accent-2)] hover:underline flex items-center gap-1 truncate"
              >
                <ExternalLink size={11} />
                {linkSimulado}
              </a>
            </div>
          )}

          {estado.tipo === 'enviado' && (
            <div className="flex items-center gap-1.5 text-[12px] text-green-400">
              <CheckCircle2 size={13} />
              <span>Enviado{estado.advertencia ? ` — ${estado.advertencia}` : ''} ✅</span>
            </div>
          )}
          {estado.tipo === 'manual' && (
            <div className="flex items-center gap-1.5 text-[12px] text-amber-400">
              <ExternalLink size={13} />
              <span>enviado manual 📲</span>
            </div>
          )}
          {estado.tipo === 'ya_contactado' && (
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--tx-ink-muted)]">
              <XCircle size={13} />
              <span>Ya contactado</span>
            </div>
          )}
          {estado.tipo === 'error' && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-400">
              <XCircle size={13} />
              <span>❌ {estado.mensaje}</span>
            </div>
          )}

          {!yaTermino && (
            <div className="flex items-center gap-2">
              <button
                onClick={aprobarYEnviar}
                disabled={enviando || !texto.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border border-green-500/20 bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-40"
              >
                {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                <span>Aprobar y enviar</span>
              </button>
              <button
                onClick={simular}
                disabled={enviando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-[var(--tx-ink-secondary)] transition-colors disabled:opacity-40"
              >
                <Eye size={12} />
                <span>Simular</span>
              </button>
              <button
                onClick={() => setEstado({ tipo: 'descartado' })}
                disabled={enviando}
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
