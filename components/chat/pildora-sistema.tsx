import { PhoneIcon } from 'lucide-react'

/** Evento de llamada: píldora de sistema centrada, no una burbuja. */
export function PildoraSistema({ texto, hora }: { texto: string; hora: string }) {
  return (
    <div className="my-1 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chat-surface-soft)] px-3 py-1 text-[12px] text-[var(--chat-meta)]">
        <PhoneIcon className="size-3.5" aria-hidden />
        {texto}
        <time>{hora}</time>
      </span>
    </div>
  )
}
