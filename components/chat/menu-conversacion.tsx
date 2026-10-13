'use client'

import { Drawer } from 'vaul'
import { ArchiveIcon, BellOffIcon, CheckCheckIcon, PinIcon } from 'lucide-react'
import type { Conversacion } from '@/lib/types/chat'

interface MenuConversacionProps {
  abierta: boolean
  conversacion: Conversacion
  onAbierta: (abierta: boolean) => void
  onLeida: () => void
  onFijar: () => void
  onArchivar: () => void
  onSilenciar: (hasta: string | null) => void
}

export function MenuConversacion(props: MenuConversacionProps) {
  const { abierta, conversacion, onAbierta } = props
  const silenciada = Boolean(
    conversacion.silenciado_hasta &&
      // eslint-disable-next-line react-hooks/purity
      new Date(conversacion.silenciado_hasta).getTime() > Date.now(),
  )
  const elegir = (accion: () => void) => () => {
    accion()
    onAbierta(false)
  }

  return (
    <Drawer.Root open={abierta} onOpenChange={onAbierta} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <Drawer.Content className="chat-sheet fixed inset-x-0 bottom-0 z-[81] mx-auto max-w-lg rounded-t-[24px] p-3 pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
          <Drawer.Title className="sr-only">Acciones de conversación</Drawer.Title>
          <Drawer.Description className="sr-only">Fijar, silenciar, marcar y archivar</Drawer.Description>
          <Opcion icono={<CheckCheckIcon />} onClick={elegir(props.onLeida)}>
            {conversacion.no_leidos ? 'Marcar como leído' : 'Marcar como no leído'}
          </Opcion>
          <Opcion icono={<PinIcon />} onClick={elegir(props.onFijar)}>
            {conversacion.fijado_at ? 'Desfijar' : 'Fijar'}
          </Opcion>
          {silenciada ? (
            <Opcion icono={<BellOffIcon />} onClick={elegir(() => props.onSilenciar(null))}>
              Activar notificaciones
            </Opcion>
          ) : (
            <div className="rounded-2xl bg-[var(--chat-surface-soft)] p-2">
              <p className="px-2 py-1 text-xs font-semibold text-[var(--chat-meta)]">Silenciar</p>
              <div className="grid grid-cols-3 gap-1">
                <Mini onClick={elegir(() => props.onSilenciar(desdeAhora(8)))}>8 h</Mini>
                <Mini onClick={elegir(() => props.onSilenciar(desdeAhora(24 * 7)))}>1 semana</Mini>
                <Mini onClick={elegir(() => props.onSilenciar('9999-12-31T23:59:59.999Z'))}>Siempre</Mini>
              </div>
            </div>
          )}
          <Opcion icono={<ArchiveIcon />} onClick={elegir(props.onArchivar)}>
            {conversacion.archivado_at ? 'Desarchivar' : 'Archivar'}
          </Opcion>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function desdeAhora(horas: number): string {
  return new Date(Date.now() + horas * 60 * 60 * 1000).toISOString()
}

function Opcion({ icono, onClick, children }: { icono: React.ReactElement; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-[var(--chat-ink)] active:scale-[.98]">
      <span className="[&>svg]:size-5 text-[var(--chat-meta)]" aria-hidden>{icono}</span>{children}
    </button>
  )
}

function Mini({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="min-h-11 rounded-xl px-2 text-xs text-[var(--chat-ink)] active:scale-[.97]">{children}</button>
}
