import { etiquetaDiaChat } from '@/lib/utils/fecha-santiago'

interface SeparadorDiaProps {
  /** Instante del primer mensaje del día (ISO o Date). */
  fecha: string | Date
}

/**
 * La línea de fecha entre bloques de días en un hilo, al estilo de WhatsApp.
 *
 * Sutil a propósito: es una referencia, no un mensaje. Se lee cuando se la
 * busca y desaparece cuando no. Sin ella, un hilo con pausas de días se lee
 * como una sola conversación seguida — que era justo lo confuso.
 */
export function SeparadorDia({ fecha }: SeparadorDiaProps) {
  return (
    <div className="flex items-center gap-3 py-2 select-none" role="separator" aria-label={etiquetaDiaChat(fecha)}>
      <span className="flex-1 h-px bg-[var(--tx-ink-primary)]/[0.07]" />
      <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] leading-none text-[var(--tx-ink-muted)] bg-white/[0.04] border border-white/[0.06]">
        {etiquetaDiaChat(fecha)}
      </span>
      <span className="flex-1 h-px bg-[var(--tx-ink-primary)]/[0.07]" />
    </div>
  )
}
