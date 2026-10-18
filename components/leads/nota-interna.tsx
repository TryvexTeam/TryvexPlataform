'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Loader2, StickyNoteIcon } from 'lucide-react'
import { toast } from '@/lib/toast'

/**
 * Compositor de notas internas del lead.
 *
 * Una nota es lo que el equipo se cuenta entre sí sobre este lead: "el dueño
 * atiende después de las 6", "pidió que le escribamos en enero". Nunca sale
 * hacia el cliente.
 *
 * Por eso NO cuenta como haberlo contactado: no mueve el estado del pipeline
 * ni toca `ultimo_contacto`. Anotar algo sobre alguien no es haber hablado con
 * él, y si contara, un lead se marcaría como atendido solo por dejar un
 * recordatorio.
 *
 * Tiene la forma del compositor de un chat porque es el gesto que ya conoce
 * cualquiera: escribir y enviar. Va ARRIBA del hilo — con veinte
 * interacciones, dejarlo al final obligaría a bajar hasta el fondo cada vez
 * que alguien quiere apuntar algo.
 */

interface NotaInternaProps {
  leadId: string
  /** Se llama tras guardar, para refrescar el hilo. */
  onGuardada: () => void
}

export function NotaInterna({ leadId, onGuardada }: NotaInternaProps) {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const sinMovimiento = useReducedMotion()

  const puedeEnviar = texto.trim().length > 0 && !guardando

  async function enviar() {
    if (!puedeEnviar) return
    setGuardando(true)
    try {
      const res = await fetch('/api/interacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sin `integrante_id`: lo pone el servidor desde la sesión, para que
        // nadie pueda firmar una nota a nombre de otro.
        body: JSON.stringify({
          lead_id: leadId,
          tipo: 'nota',
          contenido: texto.trim(),
        }),
      })
      if (!res.ok) throw new Error('No se pudo guardar la nota')
      setTexto('')
      onGuardada()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la nota')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div
        className="flex items-end gap-2 rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-2
          transition-colors focus-within:border-white/[0.16]"
      >
        <StickyNoteIcon
          size={15}
          className="mb-2.5 ml-1.5 shrink-0 text-[var(--tx-ink-muted)]"
          aria-hidden="true"
        />

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envía y Mayús+Enter salta de línea: es lo que hace
            // cualquier chat, y una nota casi siempre es de una línea.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
          rows={1}
          placeholder="Nota interna — no le llega al cliente"
          className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[13px]
            leading-snug text-[var(--tx-ink-primary)] outline-none
            placeholder:text-[var(--tx-ink-muted)]"
          // El campo crece con el texto en vez de tener barra propia: una nota
          // de tres líneas no debería obligar a desplazarse dentro de la caja.
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 112)}px`
          }}
        />

        <motion.button
          type="button"
          onClick={() => void enviar()}
          disabled={!puedeEnviar}
          aria-label="Guardar nota"
          whileTap={sinMovimiento || !puedeEnviar ? undefined : { scale: 0.94 }}
          className="mb-0.5 flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px]
            font-medium transition-colors disabled:cursor-not-allowed"
          style={{
            background: puedeEnviar ? '#ffffff' : 'rgba(255,255,255,.06)',
            color: puedeEnviar ? 'var(--tx-bg-primary)' : 'var(--tx-ink-muted)',
          }}
        >
          {guardando ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
          Anotar
        </motion.button>
      </div>

      <p className="px-2 text-[11px] text-[var(--tx-ink-muted)]">
        Solo la ve el equipo. No mueve el lead de etapa ni cuenta como contacto.
      </p>
    </div>
  )
}
