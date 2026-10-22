'use client'

import { ChevronLeftIcon, PhoneIcon, VideoIcon } from 'lucide-react'
import type { Conversacion } from '@/lib/types/chat'
import type { PresenciaIntegrante } from '@/lib/types/presencia'
import { avatarConversacion, tituloConversacion } from '@/lib/types/chat'
import { detallePresencia, estadoVisible, PRESENCIA_LABEL } from '@/lib/types/presencia'
import { AvatarChat } from './avatar-chat'

interface HeaderConversacionProps {
  conversacion: Conversacion
  miIntegranteId: string
  enLinea: Set<string>
  disponibilidad: Map<string, PresenciaIntegrante>
  escribiendo?: string
  noLeidosOtros: number
  hayLlamada: boolean
  onVolver: () => void
  onLlamar: (video: boolean) => void
}

export function HeaderConversacion(props: HeaderConversacionProps) {
  const { conversacion: c } = props
  const titulo = tituloConversacion(c, props.miIntegranteId)
  const otro = c.miembros.find((m) => m.integrante_id !== props.miIntegranteId)
  const presencia = otro ? props.disponibilidad.get(otro.integrante_id) : undefined
  const estado = otro ? estadoVisible(presencia, props.enLinea.has(otro.integrante_id)) : undefined
  const subtitulo = props.escribiendo || (c.tipo === 'dm'
    ? detallePresencia(presencia, otro ? props.enLinea.has(otro.integrante_id) : false) ?? (estado ? PRESENCIA_LABEL[estado] : 'Sin datos')
    : c.miembros.filter((m) => m.integrante_id !== props.miIntegranteId).map((m) => m.nombre).join(', '))

  return (
    <header className="chat-conversation-header flex shrink-0 items-center gap-1 px-1.5 pt-safe">
      <button onClick={props.onVolver} aria-label="Volver a Chats" className="relative grid size-11 shrink-0 place-items-center rounded-full text-[var(--chat-accent)] active:scale-[.97] md:hidden">
        <ChevronLeftIcon className="size-7" />
        {props.noLeidosOtros ? <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-[var(--chat-accent)] px-1 text-[10px] font-bold text-white">{props.noLeidosOtros > 99 ? '99+' : props.noLeidosOtros}</span> : null}
      </button>
      <AvatarChat nombre={titulo} avatarUrl={avatarConversacion(c, props.miIntegranteId).url} color={avatarConversacion(c, props.miIntegranteId).color} estado={c.tipo === 'dm' ? estado : undefined} size={36} integranteId={c.tipo === 'dm' ? otro?.integrante_id : null} />
      <div className="min-w-0 flex-1 px-1">
        <h2 className="truncate text-[17px] font-semibold text-[var(--chat-ink)]">{titulo}</h2>
        <p className={`truncate text-[13px] ${props.escribiendo ? 'text-[var(--chat-accent)]' : 'text-[var(--chat-meta)]'}`}>{subtitulo || `${c.miembros.length} integrantes`}</p>
      </div>
      {c.tipo !== 'agentes' ? <div className="chat-glass-actions flex shrink-0 items-center">
        <Boton etiqueta="Videollamada" onClick={() => props.onLlamar(true)}><VideoIcon /></Boton>
        <Boton etiqueta={props.hayLlamada ? 'Unirse a la llamada' : 'Llamar'} onClick={() => props.onLlamar(false)} destacado={props.hayLlamada}><PhoneIcon /></Boton>
      </div> : null}
    </header>
  )
}

function Boton({ etiqueta, onClick, destacado, children }: { etiqueta: string; onClick: () => void; destacado?: boolean; children: React.ReactElement }) {
  return <button onClick={onClick} aria-label={etiqueta} title={etiqueta} className={`grid size-11 place-items-center rounded-full active:scale-[.97] [&>svg]:size-[22px] ${destacado ? 'text-[var(--chat-accent)]' : 'text-[var(--chat-ink)]'}`}>{children}</button>
}
