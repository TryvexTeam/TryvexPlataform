'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Lead } from '@/lib/types/lead'

/**
 * El chat de WhatsApp del lead, DENTRO del CRM.
 *
 * Reemplaza al `window.open('https://wa.me/...')` que sacaba al equipo de la
 * plataforma. Pedido de Cristian (10-ago-2026): *"no queremos que nos mande a
 * la pagina de WhatsApp Web sino hablarle desde ahi mismo"*.
 *
 * El mensaje sale del numero de Tryvex por el puente del VPS. Este componente
 * no le habla al puente: escribe en el buzon (`POST /api/wa/send`) y el puente
 * lo pasa a buscar — el puente escucha en localhost y desde Vercel es
 * inalcanzable. Ver la migracion 041.
 */

interface MensajeWa {
  id: string
  direccion: 'in' | 'out'
  texto: string
  es_bot?: boolean | null
  enviado_por?: string | null
  estado_envio?: string | null
  created_at: string
}

/** Cada cuanto se mira si contestaron, mientras el chat esta abierto. */
const REFRESCO_MS = 5000

/** El primer mensaje, ya escrito. Editable: es un punto de partida, no un molde. */
export function textoSugerido(lead: Lead): string {
  const negocio = lead.nombre_negocio ?? 'tu negocio'
  return (
    `Hola 👋 ¿hablo con ${negocio}?\n\n` +
    `Somos Tryvex. Ayudamos a negocios como el tuyo a conseguir más clientes ` +
    `con una página web lista en días. ¿Te muestro un ejemplo, sin compromiso?`
  )
}

function hora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function LeadChatWa({ lead }: { lead: Lead }) {
  const [mensajes, setMensajes] = useState<MensajeWa[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  // La sugerencia se pone UNA vez, y solo si la conversacion esta en blanco.
  // Antes se ponia al montar el componente, sin mirar el hilo: al reabrir un
  // chat ya empezado volvia a aparecer "Hola 👋 ¿hablo con...?" encima, como si
  // fuera el primer contacto. Es un punto de partida, no un molde que se repite.
  const sugerenciaResuelta = useRef(false)
  // El lead vive en un ref para que `cargar` no dependa del objeto entero: si
  // dependiera, se recrearia en cada render y el refresco se reiniciaria solo.
  const leadRef = useRef(lead)
  useEffect(() => {
    leadRef.current = lead
  }, [lead])

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${lead.id}/mensajes`)
      if (!r.ok) return
      const d = await r.json()
      const lista: MensajeWa[] = d.data ?? []
      setMensajes(lista)

      if (!sugerenciaResuelta.current) {
        sugerenciaResuelta.current = true
        // Conversacion nueva: se ofrece el primer mensaje ya escrito.
        // Conversacion empezada: la caja queda vacia para responder.
        if (lista.length === 0) setTexto(textoSugerido(leadRef.current))
      }
    } catch {
      // Sin conexión no se avisa cada 5 segundos: sería ruido, no información.
    } finally {
      setCargando(false)
    }
    // Solo el id: con el objeto `lead` entero, esto se recrearia en cada render
    // del panel y el refresco de 5 s se reiniciaria solo, sin dispararse nunca.
  }, [lead.id])

  // Se refresca solo mientras el chat está abierto, y se corta al cerrarlo:
  // un sondeo que sigue vivo detrás de una pantalla cerrada es gasto puro.
  useEffect(() => {
    // `cargar` es async: en este tick solo arranca el fetch, y el setState
    // pasa recien cuando responde. La regla no puede ver a traves del await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
    const t = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mensajes.length])

  async function enviar() {
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    try {
      const r = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, texto: limpio, enviado_por: 'Equipo' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `no se pudo enviar (${r.status})`)
      setTexto('')
      toast.success('Mensaje encolado — sale en unos segundos')
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
        <MessageCircleIcon />
        <span className="text-[12px] font-medium text-[var(--tx-ink)]">
          WhatsApp · {lead.nombre_negocio ?? 'este lead'}
        </span>
        <span className="ml-auto text-[11px] text-[var(--tx-ink-muted)]">
          sale del número de Tryvex
        </span>
      </div>

      {/* El hilo */}
      <div className="max-h-[280px] overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {cargando && (
          <p className="text-[12px] text-[var(--tx-ink-muted)]">Cargando…</p>
        )}
        {!cargando && mensajes.length === 0 && (
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            Todavía no hay mensajes. El primero que mandes aparece acá.
          </p>
        )}
        {mensajes.map((m) => {
          const mio = m.direccion === 'out'
          const quien = mio ? (m.es_bot ? 'Vex' : m.enviado_por || 'Equipo') : (lead.nombre_negocio ?? 'Lead')
          return (
            <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                  mio
                    ? 'bg-green-500/15 border border-green-500/20 text-[var(--tx-ink)]'
                    : 'bg-white/[0.05] border border-white/[0.06] text-[var(--tx-ink)]'
                }`}
              >
                {m.texto}
                <div className="mt-1 text-[10px] text-[var(--tx-ink-muted)]">
                  {quien} · {hora(m.created_at)}
                  {mio && m.estado_envio ? ` · ${m.estado_envio}` : ''}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={finRef} />
      </div>

      {/* Escribir */}
      <div className="border-t border-white/[0.06] p-3 flex gap-2 items-end">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace un salto de linea: lo que espera
            // cualquiera que haya usado un chat.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              enviar()
            }
          }}
          rows={3}
          placeholder="Escribí el mensaje…"
          className="flex-1 resize-none rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[13px] text-[var(--tx-ink)] outline-none focus:border-green-500/30 placeholder:text-[var(--tx-ink-muted)]"
        />
        <button
          onClick={enviar}
          disabled={!texto.trim() || enviando}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border border-green-500/20 bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-40"
        >
          {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

function MessageCircleIcon() {
  return (
    <span className="text-green-400" aria-hidden>
      💬
    </span>
  )
}
