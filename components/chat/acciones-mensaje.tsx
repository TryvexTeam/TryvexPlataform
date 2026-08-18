'use client'

import { useState } from 'react'
import { CopyIcon, MessageSquareIcon, PinIcon, PinOffIcon, ReplyIcon, SmilePlusIcon, Trash2Icon } from 'lucide-react'
import { EMOJIS_RAPIDOS } from '@/lib/types/chat'

interface AccionesMensajeProps {
  puedeBorrar: boolean
  fijado?: boolean
  onResponder: () => void
  onAbrirHilo: () => void
  onBorrar: () => void
  onReaccionar?: (emoji: string) => void
  onFijar?: () => void
  onCopiar?: () => void
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
  fijado,
  onResponder,
  onAbrirHilo,
  onBorrar,
  onReaccionar,
  onFijar,
  onCopiar,
}: AccionesMensajeProps) {
  const [emojisAbiertos, setEmojisAbiertos] = useState(false)

  return (
    <div
      className="relative flex items-center gap-0.5 rounded-lg p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity"
      style={{ background: 'var(--tx-bg-primary)', border: '1px solid var(--border)' }}
    >
      {onReaccionar && (
        <>
          <Boton
            etiqueta="Reaccionar"
            onClick={() => setEmojisAbiertos((v) => !v)}
            expandido={emojisAbiertos}
          >
            <SmilePlusIcon className="size-3.5" />
          </Boton>

          {emojisAbiertos && (
            <>
              {/* Capa que cierra al tocar fuera. Va antes que la paleta para quedar
                  debajo, y sin ella en un teléfono no habría forma de cerrarla. */}
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Cerrar selector de emoji"
                onClick={() => setEmojisAbiertos(false)}
              />
              <div
                className="absolute bottom-full right-0 z-50 mb-1 flex items-center gap-0.5 rounded-lg p-1 shadow-lg"
                style={{ background: 'var(--tx-bg-primary)', border: '1px solid var(--border)' }}
              >
                {EMOJIS_RAPIDOS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReaccionar(emoji)
                      setEmojisAbiertos(false)
                    }}
                    title={`Reaccionar con ${emoji}`}
                    aria-label={`Reaccionar con ${emoji}`}
                    className="size-8 grid place-items-center rounded-md text-base transition-transform hover:scale-125 hover:bg-white/8"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Boton etiqueta="Responder" onClick={onResponder}>
        <ReplyIcon className="size-3.5" />
      </Boton>
      <Boton etiqueta="Abrir hilo" onClick={onAbrirHilo}>
        <MessageSquareIcon className="size-3.5" />
      </Boton>
      {onCopiar && (
        <Boton etiqueta="Copiar mensaje" onClick={onCopiar}>
          <CopyIcon className="size-3.5" />
        </Boton>
      )}
      {onFijar && (
        <Boton etiqueta={fijado ? 'Dejar de fijar' : 'Fijar en la conversación'} onClick={onFijar}>
          {fijado ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
        </Boton>
      )}
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
  expandido,
  children,
}: {
  etiqueta: string
  onClick: () => void
  peligro?: boolean
  /** Solo para el que abre la paleta de emoji: un lector de pantalla debe saberlo. */
  expandido?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={etiqueta}
      aria-label={etiqueta}
      {...(expandido !== undefined ? { 'aria-expanded': expandido } : {})}
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
