'use client'

import { Drawer } from 'vaul'
import { CheckCheckIcon } from 'lucide-react'
import type { Mensaje, MiembroChat } from '@/lib/types/chat'

const FECHA_HORA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

interface InfoMensajeProps {
  mensaje: Mensaje | null
  miembros: MiembroChat[]
  miIntegranteId: string
  onCerrar: () => void
}

/** Quién leyó un mensaje propio y cuándo (la hora es la de su última lectura de la conversación). */
export function InfoMensaje({ mensaje, miembros, miIntegranteId, onCerrar }: InfoMensajeProps) {
  const otros = miembros.filter((m) => m.integrante_id !== miIntegranteId)
  const leyeron = mensaje ? otros.filter((m) => m.ultimo_leido_at >= mensaje.created_at) : []
  const faltan = mensaje ? otros.filter((m) => m.ultimo_leido_at < mensaje.created_at) : []

  return (
    <Drawer.Root open={Boolean(mensaje)} onOpenChange={(abierta) => !abierta && onCerrar()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[95] bg-black/50" />
        <Drawer.Content className="chat-sheet fixed inset-x-0 bottom-0 z-[96] mx-auto max-h-[70vh] max-w-lg overflow-y-auto rounded-t-[24px] p-4 pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
          <Drawer.Title className="text-[17px] font-semibold text-[var(--chat-ink)]">Info del mensaje</Drawer.Title>
          <Drawer.Description className="sr-only">Quién lo leyó</Drawer.Description>
          <Seccion titulo="Leído por" vacio="Todavía nadie">
            {leyeron.map((m) => (
              <Fila key={m.integrante_id} nombre={m.nombre} detalle={FECHA_HORA.format(new Date(m.ultimo_leido_at))} leido />
            ))}
          </Seccion>
          {faltan.length > 0 && (
            <Seccion titulo="Sin leer" vacio="">
              {faltan.map((m) => (
                <Fila key={m.integrante_id} nombre={m.nombre} />
              ))}
            </Seccion>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function Seccion({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-xs font-semibold uppercase text-[var(--chat-meta)]">{titulo}</h3>
      {children.length ? children : <p className="py-2 text-sm text-[var(--chat-meta)]">{vacio}</p>}
    </section>
  )
}

function Fila({ nombre, detalle, leido }: { nombre: string; detalle?: string; leido?: boolean }) {
  return (
    <div className="flex min-h-11 items-center gap-2 border-b border-[var(--chat-separator)] text-[15px] text-[var(--chat-ink)]">
      {leido && <CheckCheckIcon className="size-4 text-[#53BDEB]" aria-hidden />}
      <span className="flex-1 truncate">{nombre}</span>
      {detalle && <span className="text-sm text-[var(--chat-meta)]">{detalle}</span>}
    </div>
  )
}
