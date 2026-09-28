'use client'

import { useState, useSyncExternalStore } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Lead } from '@/lib/types/lead'
import { textoSugerido } from '@/lib/leads/texto-sugerido'
import { enlaceWhatsapp, esTelefono } from '@/lib/leads/abrir-whatsapp'
import { normalizarTelefono } from '@/lib/vex/telefono'

/**
 * Escribirle al lead desde el WhatsApp PROPIO, no desde el número del equipo.
 *
 * El chat del CRM sale por el número del equipo y depende del QR vinculado en
 * el VPS: si esa sesión se cae, no hay cómo escribirle a nadie. Esto es la vía
 * que no depende de nada: abre WhatsApp (la app en el teléfono, WhatsApp Web
 * en el computador) con el mensaje ya escrito, y la persona lo envía.
 *
 * Como esa conversación no pasa por el CRM, ofrece anotar el mensaje en el
 * historial manual del lead (no en el de Vex).
 */

interface Props {
  lead: Lead
  onCerrar: () => void
  /** Se anotó algo en el historial manual: quien lo muestra puede recargar. */
  onAnotado?: () => void
}

const sinSuscripcion = () => () => {}
function detectarTelefono(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  return esTelefono({ userAgent: nav.userAgent, mobile: nav.userAgentData?.mobile, maxTouchPoints: nav.maxTouchPoints })
}

export function LeadEscribirWhatsapp({ lead, onCerrar, onAnotado }: Props) {
  const [texto, setTexto] = useState(() => textoSugerido(lead))
  const [anotar, setAnotar] = useState(true)
  const enTelefono = useSyncExternalStore(sinSuscripcion, detectarTelefono, () => false)
  const numero = normalizarTelefono(lead.telefono)

  async function abrir() {
    if (!numero) {
      toast.error('Este lead no tiene un número válido. Corrígelo en Editar.')
      return
    }
    const mensaje = texto.trim()
    if (!mensaje) return
    // Se abre ANTES de cualquier await: el navegador solo deja abrir una
    // pestaña nueva dentro del mismo gesto del clic.
    window.open(enlaceWhatsapp(numero, mensaje, enTelefono), '_blank', 'noopener,noreferrer')

    if (anotar) {
      try {
        const res = await fetch(`/api/leads/${lead.id}/historial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direccion: 'out', texto: mensaje, canal: 'whatsapp' }),
        })
        if (!res.ok) throw new Error(String(res.status))
        onAnotado?.()
        toast.success('WhatsApp abierto · anotado en el historial')
      } catch {
        toast.error('WhatsApp se abrió, pero no se pudo anotar en el historial')
      }
    } else {
      toast.success('WhatsApp abierto: revisa el mensaje y envíalo')
    }
    onCerrar()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--tx-ink-primary)]">Escribir por WhatsApp</h2>
          <p className="mt-0.5 text-[12px] text-[var(--tx-ink-muted)]">
            Desde tu WhatsApp, no el del equipo. Se abre {enTelefono ? 'la app' : 'WhatsApp Web'} con el mensaje listo para enviar.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="shrink-0 rounded-lg p-1.5 text-[var(--tx-ink-muted)] hover:bg-white/[0.06] hover:text-[var(--tx-ink-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-[12px] font-medium text-[var(--tx-ink-secondary)]">
        Mensaje (puedes editarlo)
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={7}
          className="min-h-32 flex-1 resize-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[13px] font-normal leading-relaxed text-[var(--tx-ink-primary)] outline-none focus:border-green-500/30"
        />
      </label>

      <label className="flex items-center gap-2 text-[12px] text-[var(--tx-ink-secondary)]">
        <input type="checkbox" checked={anotar} onChange={(e) => setAnotar(e.target.checked)} className="size-4 accent-green-500" />
        Anotarlo en el historial del lead
      </label>

      {!numero && (
        <p role="alert" className="text-[12px] text-red-400">
          El teléfono de este lead no es válido ({lead.telefono || 'vacío'}). Corrígelo en Editar.
        </p>
      )}

      <button
        type="button"
        onClick={abrir}
        disabled={!numero || !texto.trim()}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 text-[13px] font-semibold text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-40"
      >
        <ExternalLink size={14} />
        {enTelefono ? 'Abrir en la app de WhatsApp' : 'Abrir en WhatsApp Web'}
      </button>
    </div>
  )
}
