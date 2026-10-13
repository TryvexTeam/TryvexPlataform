'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CopyIcon, ForwardIcon, InfoIcon, MessageSquareIcon, PencilIcon, PinIcon, PinOffIcon,
  PlusIcon, ReplyIcon, Trash2Icon,
} from 'lucide-react'
import { EMOJIS_RAPIDOS } from '@/lib/types/chat'
import { EMOJIS_AMPLIADOS } from '@/lib/chat/emojis-reaccion'

export interface OpcionesMenuMensaje {
  fijado: boolean
  puedeCopiar: boolean
  puedeEditar: boolean
  puedeInfo: boolean
  puedeEliminar: boolean
}

export interface AccionesMenuMensaje {
  reaccionar: (emoji: string) => void
  responder: () => void
  hilo: () => void
  reenviar: () => void
  copiar: () => void
  editar: () => void
  fijar: () => void
  info: () => void
  eliminar: () => void
}

interface MenuMensajeProps {
  rect: { top: number; left: number; right: number; width: number; height: number }
  /** Posición del clic derecho en escritorio; sin ella, el menú es el táctil con la burbuja elevada. */
  punto?: { x: number; y: number }
  mio: boolean
  opciones: OpcionesMenuMensaje
  acciones: AccionesMenuMensaje
  /** Copia de la burbuja para mostrarla elevada en móvil. */
  burbuja: React.ReactNode
  onCerrar: () => void
}

const ANCHO_MENU = 260
const ALTO_FILA = 44

export function MenuMensaje({ rect, punto, mio, opciones, acciones, burbuja, onCerrar }: MenuMensajeProps) {
  const [ampliado, setAmpliado] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const tactil = !punto && typeof window !== 'undefined' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches

  const elegir = (accion: () => void) => () => {
    onCerrar()
    accion()
  }
  const filas = [
    { clave: 'responder', texto: 'Responder', icono: <ReplyIcon />, ir: acciones.responder },
    { clave: 'hilo', texto: 'Responder en hilo', icono: <MessageSquareIcon />, ir: acciones.hilo },
    { clave: 'reenviar', texto: 'Reenviar', icono: <ForwardIcon />, ir: acciones.reenviar },
    ...(opciones.puedeCopiar ? [{ clave: 'copiar', texto: 'Copiar', icono: <CopyIcon />, ir: acciones.copiar }] : []),
    ...(opciones.puedeEditar ? [{ clave: 'editar', texto: 'Editar', icono: <PencilIcon />, ir: acciones.editar }] : []),
    { clave: 'fijar', texto: opciones.fijado ? 'Desfijar' : 'Fijar', icono: opciones.fijado ? <PinOffIcon /> : <PinIcon />, ir: acciones.fijar },
    ...(opciones.puedeInfo ? [{ clave: 'info', texto: 'Info', icono: <InfoIcon />, ir: acciones.info }] : []),
    ...(opciones.puedeEliminar ? [{ clave: 'eliminar', texto: 'Eliminar', icono: <Trash2Icon />, ir: acciones.eliminar, peligro: true }] : []),
  ]

  // Foco atrapado: entra al primer elemento y vuelve al anterior al cerrar.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    raiz.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => previo?.focus?.()
  }, [])

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onCerrar()
    const items = Array.from(raiz.current?.querySelectorAll<HTMLElement>('button') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const alto = 52 + 8 + (tactil ? Math.min(rect.height, vh * 0.4) + 8 : 0) + filas.length * ALTO_FILA + 12
  const ancho = Math.max(ANCHO_MENU, tactil ? rect.width : 0)
  const izquierda = punto
    ? Math.min(punto.x, vw - ancho - 8)
    : Math.max(8, Math.min(mio ? rect.right - ancho : rect.left, vw - ancho - 8))
  const arriba = punto
    ? Math.max(8, Math.min(punto.y, vh - alto - 8))
    : Math.max(8, Math.min(rect.top - 60, vh - alto - 8))

  return (
    <div className="fixed inset-0 z-[90]" onKeyDown={alTeclear}>
      <button
        aria-label="Cerrar menú"
        onClick={onCerrar}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        style={{ background: tactil ? 'oklch(0% 0 0 / 45%)' : 'transparent', backdropFilter: tactil ? 'blur(14px)' : undefined, WebkitBackdropFilter: tactil ? 'blur(14px)' : undefined }}
      />
      <div ref={raiz} role="menu" aria-label="Acciones del mensaje" className="chat-entra absolute flex flex-col gap-2" style={{ left: izquierda, top: arriba, width: ancho }}>
        <div className="flex items-center justify-between rounded-full border border-[var(--chat-separator)] bg-[var(--tx-bg-secondary)] px-2 py-1 shadow-xl">
          {EMOJIS_RAPIDOS.map((emoji) => (
            <button key={emoji} role="menuitem" aria-label={`Reaccionar con ${emoji}`} onClick={elegir(() => acciones.reaccionar(emoji))} className="grid size-11 place-items-center rounded-full text-[24px] active:scale-90">
              {emoji}
            </button>
          ))}
          <button role="menuitem" aria-label="Más emojis" aria-expanded={ampliado} onClick={() => setAmpliado((v) => !v)} className="grid size-11 place-items-center rounded-full text-[var(--chat-meta)]">
            <PlusIcon className="size-5" />
          </button>
        </div>

        {tactil && <div className={`max-h-[40vh] overflow-hidden ${mio ? 'self-end' : 'self-start'}`} style={{ width: rect.width }} aria-hidden>{burbuja}</div>}

        {ampliado ? (
          <div className="grid grid-cols-6 gap-1 rounded-2xl border border-[var(--chat-separator)] bg-[var(--tx-bg-secondary)] p-2 shadow-xl">
            {EMOJIS_AMPLIADOS.map((emoji) => (
              <button key={emoji} role="menuitem" aria-label={`Reaccionar con ${emoji}`} onClick={elegir(() => acciones.reaccionar(emoji))} className="grid size-10 place-items-center rounded-lg text-[22px] hover:bg-[var(--chat-surface-soft)]">
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--chat-separator)] bg-[var(--tx-bg-secondary)] shadow-xl">
            {filas.map((f) => (
              <button
                key={f.clave}
                role="menuitem"
                onClick={elegir(f.ir)}
                className={`flex w-full items-center justify-between px-4 text-[16px] hover:bg-[var(--chat-surface-soft)] focus-visible:bg-[var(--chat-surface-soft)] ${'peligro' in f && f.peligro ? 'text-[var(--chat-error)]' : 'text-[var(--chat-ink)]'}`}
                style={{ height: ALTO_FILA }}
              >
                {f.texto}
                <span className="[&>svg]:size-5" aria-hidden>{f.icono}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
