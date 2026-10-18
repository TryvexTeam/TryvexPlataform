'use client'

import { useState } from 'react'
import { PinIcon, XIcon } from 'lucide-react'
import type { Mensaje } from '@/lib/types/chat'
import { textoPlano } from '@/lib/markdown/mini'

export function BarraFijados({ mensajes, onIr, onQuitar }: { mensajes: Mensaje[]; onIr: (id: string) => void; onQuitar: (mensaje: Mensaje) => void }) {
  const [indice, setIndice] = useState(0)
  if (!mensajes.length) return null
  const actual = mensajes[Math.min(indice, mensajes.length - 1)]
  return (
    <div className="chat-pinned-bar flex min-h-12 shrink-0 items-center gap-2 px-3">
      <PinIcon className="size-4 shrink-0 text-[var(--chat-accent)]" aria-hidden />
      <button onClick={() => onIr(actual.id)} className="min-w-0 flex-1 text-left"><strong className="block text-xs text-[var(--chat-accent)]">Mensaje fijado {mensajes.length > 1 ? `${indice + 1}/${mensajes.length}` : ''}</strong><span className="block truncate text-xs text-[var(--chat-meta)]">{actual.contenido ? textoPlano(actual.contenido) : 'Adjunto'}</span></button>
      {mensajes.length > 1 ? <button onClick={() => setIndice((indice + 1) % mensajes.length)} aria-label="Siguiente fijado" className="min-h-11 px-2 text-xs text-[var(--chat-meta)]">Siguiente</button> : null}
      <button onClick={() => onQuitar(actual)} aria-label="Desfijar mensaje" className="grid size-11 place-items-center text-[var(--chat-meta)]"><XIcon className="size-4" /></button>
    </div>
  )
}
