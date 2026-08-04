'use client'

import { MessageSquareIcon, ReplyIcon, Trash2Icon } from 'lucide-react'

interface AccionesMensajeProps {
  puedeBorrar: boolean
  onResponder: () => void
  onAbrirHilo: () => void
  onBorrar: () => void
}

/**
 * Lo que se puede hacer con un mensaje. Aparece al pasar el mouse por encima,
 * como en Slack — mostrarlo siempre llenaría el hilo de botones.
 *
 * En un teléfono no hay hover: por eso el contenedor también lo revela al
 * enfocar con el teclado, y los botones son de 28px, tocables con el pulgar.
 */
export function AccionesMensaje({
  puedeBorrar,
  onResponder,
  onAbrirHilo,
  onBorrar,
}: AccionesMensajeProps) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity"
      style={{ background: 'var(--tx-bg-primary)', border: '1px solid var(--border)' }}
    >
      <Boton etiqueta="Responder" onClick={onResponder}>
        <ReplyIcon className="size-3.5" />
      </Boton>
      <Boton etiqueta="Abrir hilo" onClick={onAbrirHilo}>
        <MessageSquareIcon className="size-3.5" />
      </Boton>
      {puedeBorrar && (
        <Boton etiqueta="Eliminar" onClick={onBorrar} peligro>
          <Trash2Icon className="size-3.5" />
        </Boton>
      )}
    </div>
  )
}

function Boton({
  etiqueta,
  onClick,
  peligro,
  children,
}: {
  etiqueta: string
  onClick: () => void
  peligro?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={etiqueta}
      aria-label={etiqueta}
      className={`size-7 grid place-items-center rounded-md transition-colors ${
        peligro
          ? 'text-[oklch(70%_0.16_25)] hover:bg-[oklch(70%_0.16_25)]/15'
          : 'text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] hover:bg-white/8'
      }`}
    >
      {children}
    </button>
  )
}
