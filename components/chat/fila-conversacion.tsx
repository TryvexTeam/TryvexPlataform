'use client'

import { useRef, useState } from 'react'
import { ArchiveIcon, BellOffIcon, CheckCheckIcon, PinIcon, VolumeXIcon } from 'lucide-react'
import type { Conversacion } from '@/lib/types/chat'
import { avatarConversacion, tituloConversacion } from '@/lib/types/chat'
import { estadoTicks } from '@/lib/chat/ticks'
import { pareceJson, textoPlano } from '@/lib/markdown/mini'
import { AvatarChat } from './avatar-chat'
import { MetaBurbuja } from './meta-burbuja'
import { MenuConversacion } from './menu-conversacion'

interface FilaConversacionProps {
  conversacion: Conversacion
  miIntegranteId: string
  escribiendo?: string
  activa: boolean
  onAbrir: () => void
  onLeida: () => void
  onFijar: () => void
  onArchivar: () => void
  onSilenciar: (hasta: string | null) => void
}

const HORA = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
const FECHA = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', timeZone: 'America/Santiago' })

export function FilaConversacion(props: FilaConversacionProps) {
  const { conversacion: c } = props
  const [offset, setOffset] = useState(0)
  const [menu, setMenu] = useState(false)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const largo = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titulo = tituloConversacion(c, props.miIntegranteId)
  const silenciada = Boolean(c.silenciado_hasta && new Date(c.silenciado_hasta).getTime() > Date.now())

  const down = (e: React.PointerEvent) => {
    inicio.current = { x: e.clientX - offset, y: e.clientY }
    largo.current = setTimeout(() => setMenu(true), 450)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!inicio.current) return
    const dx = e.clientX - inicio.current.x
    if (Math.abs(e.clientY - inicio.current.y) > 10 || Math.abs(dx) > 10) {
      if (largo.current) clearTimeout(largo.current)
    }
    setOffset(Math.max(-160, Math.min(160, dx)))
  }
  const up = () => {
    if (largo.current) clearTimeout(largo.current)
    setOffset(Math.abs(offset) < 55 ? 0 : Math.sign(offset) * 160)
    inicio.current = null
  }
  const abrir = () => offset ? setOffset(0) : props.onAbrir()

  return (
    <div className="relative overflow-hidden" onContextMenu={(e) => { e.preventDefault(); setMenu(true) }}>
      <div className="absolute inset-y-0 left-0 flex w-40">
        <Accion color="var(--chat-action-read)" onClick={props.onLeida} icono={<CheckCheckIcon />}>{c.no_leidos ? 'Leído' : 'No leído'}</Accion>
        <Accion color="var(--chat-accent)" onClick={props.onFijar} icono={<PinIcon />}>{c.fijado_at ? 'Desfijar' : 'Fijar'}</Accion>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-40">
        <Accion color="var(--chat-action-more)" onClick={() => setMenu(true)} icono={<VolumeXIcon />}>Más</Accion>
        <Accion color="var(--chat-action-archive)" onClick={props.onArchivar} icono={<ArchiveIcon />}>Archivar</Accion>
      </div>
      <button
        onClick={abrir}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="chat-row relative z-10 flex min-h-[76px] w-full items-center gap-3 bg-[var(--chat-list)] pl-4 pr-3 text-left"
        style={{ transform: `translate3d(${offset}px,0,0)`, transition: inicio.current ? 'none' : 'transform 220ms cubic-bezier(.32,.72,0,1)' }}
        aria-current={props.activa ? 'true' : undefined}
      >
        <AvatarChat nombre={titulo} avatarUrl={avatarConversacion(c, props.miIntegranteId).url} color={avatarConversacion(c, props.miIntegranteId).color} size={52} />
        <div className="min-w-0 flex-1 self-stretch border-b border-[var(--chat-separator)] py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-[var(--chat-ink)]">{titulo}</span>
            <time className={`shrink-0 text-sm ${c.no_leidos ? 'text-[var(--chat-accent)]' : 'text-[var(--chat-meta)]'}`}>{fechaLista(c.ultimo_mensaje_at)}</time>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`line-clamp-2 min-w-0 flex-1 text-[15px] leading-[19px] ${props.escribiendo ? 'text-[var(--chat-accent)]' : 'text-[var(--chat-meta)]'}`}>
              {props.escribiendo || <Preview conversacion={c} miIntegranteId={props.miIntegranteId} />}
            </span>
            {silenciada ? <BellOffIcon className="size-3.5 shrink-0 text-[var(--chat-meta)]" aria-label="Silenciado" /> : null}
            {c.fijado_at ? <PinIcon className="size-3.5 shrink-0 text-[var(--chat-meta)]" aria-label="Fijado" /> : null}
            {c.no_leidos > 0 ? <span className={`grid min-w-5 place-items-center rounded-full px-1 text-xs font-semibold text-white ${silenciada ? 'bg-[var(--chat-meta)]' : 'bg-[var(--chat-accent)]'}`}>{c.no_leidos > 99 ? '99+' : c.no_leidos}</span> : null}
          </div>
        </div>
      </button>
      <MenuConversacion abierta={menu} onAbierta={setMenu} conversacion={c} onLeida={props.onLeida} onFijar={props.onFijar} onArchivar={props.onArchivar} onSilenciar={props.onSilenciar} />
    </div>
  )
}

function Preview({ conversacion: c, miIntegranteId }: { conversacion: Conversacion; miIntegranteId: string }) {
  const mensaje = c.ultimo_mensaje
  if (!mensaje) return <>Sin mensajes</>
  const mio = mensaje.autor_id === miIntegranteId
  const texto = mensaje.contenido?.trim()
    ? (pareceJson(mensaje.contenido) ? 'Evento de llamada' : textoPlano(mensaje.contenido))
    : mensaje.adjuntos?.[0]?.tipo_mime.startsWith('image/') ? '📷 Imagen' : '📎 Archivo'
  return <>{mio ? <MetaBurbuja soloTick estado={estadoTicks(mensaje, c.miembros, miIntegranteId)} /> : null}{texto}</>
}

function fechaLista(valor: string): string {
  const fecha = new Date(valor)
  return Date.now() - fecha.getTime() < 86_400_000 ? HORA.format(fecha) : FECHA.format(fecha)
}

function Accion({ color, onClick, icono, children }: { color: string; onClick: () => void; icono: React.ReactElement; children: React.ReactNode }) {
  return <button onClick={onClick} className="flex w-20 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white" style={{ background: color }}><span className="[&>svg]:size-5" aria-hidden>{icono}</span>{children}</button>
}
