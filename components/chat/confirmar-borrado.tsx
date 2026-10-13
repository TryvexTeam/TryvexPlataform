'use client'

import { Drawer } from 'vaul'

interface ConfirmarBorradoProps {
  abierta: boolean
  onAbierta: (abierta: boolean) => void
  onConfirmar: () => void
}

/** Hoja propia de confirmación: nunca `confirm()` del navegador. */
export function ConfirmarBorrado({ abierta, onAbierta, onConfirmar }: ConfirmarBorradoProps) {
  return (
    <Drawer.Root open={abierta} onOpenChange={onAbierta}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[95] bg-black/50" />
        <Drawer.Content role="alertdialog" className="chat-sheet fixed inset-x-0 bottom-0 z-[96] mx-auto max-w-lg rounded-t-[24px] p-3 pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
          <Drawer.Title className="px-2 text-[17px] font-semibold text-[var(--chat-ink)]">¿Eliminar mensaje?</Drawer.Title>
          <Drawer.Description className="px-2 pb-3 pt-1 text-sm text-[var(--chat-meta)]">
            Se elimina para todos y no se puede deshacer.
          </Drawer.Description>
          <button
            onClick={() => {
              onAbierta(false)
              onConfirmar()
            }}
            className="mb-2 min-h-12 w-full rounded-xl bg-[var(--chat-surface-soft)] text-[16px] font-semibold text-[var(--chat-error)]"
          >
            Eliminar para todos
          </button>
          <button onClick={() => onAbierta(false)} className="min-h-12 w-full rounded-xl text-[16px] text-[var(--chat-ink)]">
            Cancelar
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
