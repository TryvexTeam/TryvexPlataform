'use client'

import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { CheckIcon } from 'lucide-react'
import type { Conversacion, Mensaje } from '@/lib/types/chat'
import { tituloConversacion } from '@/lib/types/chat'
import { toast } from '@/lib/toast'

interface SelectorReenvioProps {
  mensaje: Mensaje | null
  miIntegranteId: string
  onCerrar: () => void
  onReenviar: (mensaje: Mensaje, conversaciones: string[]) => Promise<boolean>
}

const MAXIMO = 5

/** Elige hasta 5 conversaciones destino. Las lista el servidor al abrir. */
export function SelectorReenvio({ mensaje, miIntegranteId, onCerrar, onReenviar }: SelectorReenvioProps) {
  const [lista, setLista] = useState<Conversacion[]>([])
  const [elegidas, setElegidas] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const abierto = Boolean(mensaje)

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    fetch('/api/chat/conversaciones')
      .then((r) => r.json())
      .then((json) => {
        if (vigente && json.success) setLista((json.data as Conversacion[]).filter((c) => c.tipo !== 'voz'))
      })
      .catch(() => toast.error('No se pudieron cargar tus chats'))
    return () => {
      vigente = false
    }
  }, [abierto])

  const alternar = (id: string) => {
    if (!elegidas.includes(id) && elegidas.length >= MAXIMO) {
      toast.error(`Máximo ${MAXIMO} conversaciones`)
      return
    }
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const enviar = async () => {
    if (!mensaje) return
    setEnviando(true)
    const ok = await onReenviar(mensaje, elegidas)
    setEnviando(false)
    if (ok) {
      setElegidas([])
      onCerrar()
    }
  }

  return (
    <Drawer.Root open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[95] bg-black/50" />
        <Drawer.Content className="chat-sheet fixed inset-x-0 bottom-0 z-[96] mx-auto flex max-h-[80vh] max-w-lg flex-col rounded-t-[24px] p-4 pb-safe">
          <Drawer.Title className="text-[17px] font-semibold text-[var(--chat-ink)]">Reenviar a…</Drawer.Title>
          <Drawer.Description className="sr-only">Elige hasta cinco conversaciones</Drawer.Description>
          <ul className="my-2 min-h-0 flex-1 overflow-y-auto">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => alternar(c.id)}
                  aria-pressed={elegidas.includes(c.id)}
                  className="flex min-h-12 w-full items-center gap-3 border-b border-[var(--chat-separator)] text-left text-[16px] text-[var(--chat-ink)]"
                >
                  <span className="flex-1 truncate">{tituloConversacion(c, miIntegranteId)}</span>
                  {elegidas.includes(c.id) && <CheckIcon className="size-5 text-[var(--chat-accent)]" />}
                </button>
              </li>
            ))}
          </ul>
          <button
            disabled={elegidas.length === 0 || enviando}
            onClick={() => void enviar()}
            className="min-h-12 w-full rounded-xl bg-[var(--chat-accent)] text-[16px] font-semibold text-[var(--tx-accent-fg)] disabled:opacity-40"
          >
            {enviando ? 'Reenviando…' : `Enviar${elegidas.length ? ` (${elegidas.length})` : ''}`}
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
