'use client'

import { memo } from 'react'
import { ChevronDownIcon, ForwardIcon, PinIcon } from 'lucide-react'
import type { Mensaje, MiembroChat } from '@/lib/types/chat'
import type { EstadoTick } from '@/lib/chat/ticks'
import { esSoloEmoji } from '@/lib/chat/emoji'
import { describirEventoLlamada } from '@/lib/chat/evento-llamada'
import { AdjuntosMensaje } from './adjuntos-mensaje'
import { CitaMensaje } from './cita-mensaje'
import { ReaccionesMensaje } from './reacciones-mensaje'
import { GestosMensaje } from './gestos-mensaje'
import { MetaBurbuja, anchoMeta } from './meta-burbuja'
import { ContenidoBurbuja } from './contenido-burbuja'
import { PildoraSistema } from './pildora-sistema'

/** Acciones estables que la lista pasa a cada burbuja (para poder memoizarla). */
export interface AccionesBurbuja {
  responder: (m: Mensaje) => void
  abrirHilo: (m: Mensaje) => void
  reaccionar: (m: Mensaje, emoji: string) => void
  abrirMenu: (m: Mensaje, elemento: HTMLElement, punto?: { x: number; y: number }) => void
  reintentar: (m: Mensaje) => void
  irA: (id: string) => void
}

export interface AutorBurbuja {
  nombre: string
  color: string | null
  esAgente: boolean
}

interface BurbujaMensajeProps {
  mensaje: Mensaje
  mio: boolean
  inicioRacha: boolean
  esGrupo: boolean
  autor?: AutorBurbuja
  tick?: EstadoTick
  citado?: Mensaje
  autorCitado?: MiembroChat
  animar: boolean
  acciones: AccionesBurbuja
}

const HORA = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })

function BurbujaMensajeBase(props: BurbujaMensajeProps) {
  const { mensaje: m, mio, inicioRacha, tick, acciones } = props
  const hora = HORA.format(new Date(m.created_at))
  const evento = describirEventoLlamada(m.contenido)
  if (evento) return <PildoraSistema texto={evento} hora={hora} />

  const eliminado = Boolean(m.eliminado_at)
  const tieneAdj = (m.adjuntos?.length ?? 0) > 0
  const soloEmoji = !eliminado && !tieneAdj && !m.responder_a && esSoloEmoji(m.contenido)
  const soloMedia = !eliminado && tieneAdj && !m.contenido?.trim()
  const editado = Boolean(m.editado_at) && !eliminado
  const meta = (
    <MetaBurbuja
      estado={mio ? tick : undefined}
      hora={hora}
      editado={editado}
      estatico={soloEmoji}
      onReintentar={() => acciones.reintentar(m)}
    />
  )

  return (
    <div
      data-msg-id={m.id}
      data-msg-fecha={m.created_at}
      className={`group flex min-w-0 px-3 ${mio ? 'justify-end' : 'justify-start'} ${props.animar ? 'chat-entra' : ''}`}
      style={{ marginTop: inicioRacha ? 'var(--chat-espacio-autor)' : 'var(--chat-espacio-racha)' }}
    >
      <GestosMensaje onResponder={() => acciones.responder(m)} onMenu={(el) => acciones.abrirMenu(m, el)}>
        <div
          className={`flex min-w-0 flex-col ${mio ? 'items-end' : 'items-start'}`}
          onContextMenu={(e) => {
            e.preventDefault()
            acciones.abrirMenu(m, e.currentTarget, { x: e.clientX, y: e.clientY })
          }}
        >
          {soloEmoji ? (
            <div className="flex flex-col items-end">
              <span className="chat-solo-emoji">{m.contenido}</span>
              {meta}
            </div>
          ) : (
            <div
              className="chat-burbuja"
              data-mia={mio}
              data-cola={inicioRacha}
              data-media={soloMedia}
              style={{ ['--chat-ancho-meta' as string]: anchoMeta(mio ? tick : undefined, editado) }}
            >
              <Cabecera {...props} />
              {tieneAdj && !eliminado && (
                <div className={m.contenido ? 'mb-1' : ''}>
                  <AdjuntosMensaje adjuntos={m.adjuntos ?? []} />
                </div>
              )}
              {eliminado ? (
                <span className="chat-texto italic opacity-60">Mensaje eliminado</span>
              ) : (
                m.contenido && !(tieneAdj && m.contenido === 'Adjunto') && <ContenidoBurbuja contenido={m.contenido} />
              )}
              {meta}
              {/* Solo donde hay hover real: en táctil se usa mantener presionado. */}
              <button
                type="button"
                aria-label="Opciones del mensaje"
                onClick={(e) => acciones.abrirMenu(m, e.currentTarget.closest('.chat-burbuja') as HTMLElement)}
                className="absolute right-1 top-1 hidden size-6 place-items-center [@media(hover:hover)_and_(pointer:fine)]:grid rounded-full bg-[var(--fondo)] text-[var(--chat-meta)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronDownIcon className="size-4" />
              </button>
            </div>
          )}
          <Pie {...props} />
        </div>
      </GestosMensaje>
    </div>
  )
}

function Cabecera({ mensaje: m, mio, inicioRacha, esGrupo, autor, citado, autorCitado, acciones }: BurbujaMensajeProps) {
  return (
    <>
      {m.reenviado && (
        <span className="mb-0.5 flex items-center gap-1 text-[12px] italic text-[var(--chat-meta)]">
          <ForwardIcon className="size-3.5" aria-hidden /> Reenviado
        </span>
      )}
      {esGrupo && !mio && inicioRacha && autor && (
        <span className="mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: autor.color ?? 'var(--chat-accent)' }}>
          {autor.nombre}
          {autor.esAgente && (
            <span className="rounded px-1 text-[9px] font-bold uppercase" style={{ background: 'var(--chat-accent-soft)' }}>
              agente
            </span>
          )}
        </span>
      )}
      {m.responder_a && (
        <div className="mb-1 rounded-md bg-black/15 p-1.5">
          <CitaMensaje citado={citado} autor={autorCitado} onIr={() => acciones.irA(m.responder_a as string)} />
        </div>
      )}
    </>
  )
}

function Pie({ mensaje: m, acciones }: BurbujaMensajeProps) {
  return (
    <>
      {(m.respuestas ?? 0) > 0 && (
        <button onClick={() => acciones.abrirHilo(m)} className="mt-1 min-h-8 text-[13px] font-semibold text-[var(--chat-accent)]">
          {m.respuestas} {m.respuestas === 1 ? 'respuesta' : 'respuestas'}
        </button>
      )}
      <ReaccionesMensaje reacciones={m.reacciones ?? []} onAlternar={(emoji) => acciones.reaccionar(m, emoji)} />
      {m.fijado_at && (
        <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-[var(--chat-meta)]">
          <PinIcon className="size-2.5" aria-hidden /> fijado
        </span>
      )}
    </>
  )
}

export const BurbujaMensaje = memo(BurbujaMensajeBase)
