'use client'

import { Drawer } from 'vaul'
import { FileTextIcon, ImageIcon } from 'lucide-react'

interface HojaAdjuntarProps {
  abierta: boolean
  onAbierta: (abierta: boolean) => void
  onArchivos: (archivos: File[]) => void
}

/** Hoja del botón "+": fotos y videos, o un documento. */
export function HojaAdjuntar({ abierta, onAbierta, onArchivos }: HojaAdjuntarProps) {
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    onArchivos(Array.from(e.target.files ?? []))
    e.target.value = ''
    onAbierta(false)
  }

  return (
    <Drawer.Root open={abierta} onOpenChange={onAbierta}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <Drawer.Content className="chat-sheet fixed inset-x-0 bottom-0 z-[81] mx-auto max-w-lg rounded-t-[24px] p-3 pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
          <Drawer.Title className="sr-only">Adjuntar</Drawer.Title>
          <Drawer.Description className="sr-only">Elige fotos, videos o un documento</Drawer.Description>
          <Opcion icono={<ImageIcon />} accept="image/*,video/*" onChange={elegir}>Fotos y videos</Opcion>
          <Opcion icono={<FileTextIcon />} accept="" onChange={elegir}>Documento</Opcion>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function Opcion({ icono, accept, onChange, children }: { icono: React.ReactElement; accept: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] text-[var(--chat-ink)] active:scale-[.98]">
      <span className="text-[var(--chat-accent)] [&>svg]:size-6" aria-hidden>{icono}</span>
      {children}
      <input type="file" multiple accept={accept || undefined} className="sr-only" onChange={onChange} />
    </label>
  )
}
