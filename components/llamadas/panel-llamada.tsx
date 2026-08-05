'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MonitorUpIcon,
  MonitorXIcon,
  PhoneOffIcon,
  ShieldAlertIcon,
  VideoIcon,
  VideoOffIcon,
} from 'lucide-react'
import { AvatarChat } from '@/components/chat/avatar-chat'
import { ChatLlamada } from './chat-llamada'
import { useLlamada, type ParticipanteVivo } from './use-llamada'

interface PersonaLlamada {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
}

interface PanelLlamadaProps {
  llamadaId: string
  /** El hilo al que pertenece la llamada, para el chat de al lado. */
  conversacionId: string
  miIntegranteId: string
  conVideo: boolean
  titulo: string
  personas: PersonaLlamada[]
  onCerrar: () => void
}

/**
 * La llamada en pantalla. Va sobre todo lo demás y no se desmonta al navegar:
 * uno entra a una llamada para hablar mientras mira un lead, no para quedarse
 * mirando la llamada.
 */
export function PanelLlamada({
  llamadaId,
  conversacionId,
  miIntegranteId,
  conVideo,
  titulo,
  personas,
  onCerrar,
}: PanelLlamadaProps) {
  const [minimizado, setMinimizado] = useState(false)
  const [chatAbierto, setChatAbierto] = useState(false)
  /**
   * A quién se está mirando en grande. `null` = todos parejos en la grilla.
   *
   * Con cinco recuadros del mismo tamaño no se lee una pantalla compartida ni se
   * le ve la cara a quien está hablando. Un clic lo agranda, otro lo devuelve.
   */
  const [destacado, setDestacado] = useState<string | null>(null)
  const {
    participantes,
    streamLocal,
    streamPantalla,
    micro,
    camara,
    compartiendo,
    error,
    hayTurn,
    alternarMicro,
    alternarCamara,
    alternarPantalla,
    colgar,
  } = useLlamada({
    llamadaId,
    miIntegranteId,
    conVideo,
    onTerminada: onCerrar,
  })

  const porId = new Map(personas.map((p) => [p.id, p]))
  const yo = porId.get(miIntegranteId)

  const terminar = async () => {
    await colgar()
    onCerrar()
  }

  // Escape cuelga: es el reflejo de cualquiera que quiera salir rápido.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMinimizado(true)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  if (error) {
    return (
      <div className="fixed inset-x-3 bottom-24 md:bottom-6 md:right-6 md:left-auto md:w-[360px] z-[80] rounded-xl p-4"
           style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}>
        <p className="text-sm text-[var(--tx-ink-primary)]">{error}</p>
        <button
          onClick={terminar}
          className="mt-3 w-full rounded-lg py-2 text-sm font-medium"
          style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
        >
          Cerrar
        </button>
      </div>
    )
  }

  // Minimizado: una barra fina para volver. Sin esto, atender una llamada
  // significa no poder usar el CRM, que es justo lo contrario de lo que se busca.
  if (minimizado) {
    return (
      <button
        onClick={() => setMinimizado(false)}
        className="fixed bottom-24 md:bottom-6 right-3 md:right-6 z-[80] flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg"
        style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
        <span className="text-[13px] font-semibold">
          En llamada · {participantes.length + 1}
        </span>
      </button>
    )
  }

  const columnas = participantes.length === 0 ? 1 : participantes.length <= 3 ? 2 : 3

  // Un solo arreglo con todos los recuadros, el propio incluido. Así la vista
  // destacada no tiene que tratar "yo" como un caso aparte -- compartir pantalla
  // y querer verla en grande es justamente lo más común.
  const recuadros: RecuadroProps[] = [
    {
      id: miIntegranteId,
      // Si estoy compartiendo, mi recuadro muestra lo que comparto, no mi cara.
      stream: streamPantalla ?? streamLocal,
      nombre: yo?.nombre ? `${yo.nombre} (tú)` : 'Tú',
      avatarUrl: yo?.avatar_url ?? null,
      color: yo?.color ?? null,
      micro,
      camara,
      compartiendo,
      estado: 'conectado',
      silenciado: true,
    },
    ...participantes.map((p) => {
      const persona = porId.get(p.integranteId)
      return {
        id: p.integranteId,
        stream: p.stream,
        nombre: persona?.nombre ?? 'Alguien',
        avatarUrl: persona?.avatar_url ?? null,
        color: persona?.color ?? null,
        micro: p.micro,
        camara: p.camara,
        compartiendo: p.compartiendo,
        estado: p.estado,
      }
    }),
  ]

  const enGrande = recuadros.find((r) => r.id === destacado) ?? null

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: 'oklch(8% 0.004 240 / 96%)', backdropFilter: 'blur(24px)' }}
      role="dialog"
      aria-label={`Llamada en ${titulo}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--tx-ink-primary)] truncate">{titulo}</p>
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            {participantes.length === 0
              ? 'Esperando a que entren…'
              : `${participantes.length + 1} en la llamada`}
          </p>
        </div>
        <button
          onClick={() => setMinimizado(true)}
          className="rounded-lg px-3 py-1.5 text-[13px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
        >
          Minimizar
        </button>
      </header>

      {/* Sin TURN hay redes donde la conexión no se va a levantar. Decirlo es
          mejor que dejar a alguien mirando un recuadro negro sin saber por qué. */}
      {!hayTurn && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
             style={{ background: 'oklch(70% 0.15 75 / 15%)', color: 'oklch(80% 0.13 75)' }}>
          <ShieldAlertIcon className="size-4 shrink-0" />
          <span>Sin servidor de retransmisión configurado: en algunas redes la llamada puede no conectar.</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 gap-3">
          {/* Vista destacada. Cuando hay alguien elegido ocupa casi todo y el
              resto baja a una tira: es lo que uno quiere cuando alguien comparte
              pantalla y hay que leer lo que muestra. */}
          {enGrande && (
            <div className="flex-1 min-h-0">
              <Recuadro {...enGrande} grande onClick={() => setDestacado(null)} />
            </div>
          )}

          <div
            className={
              enGrande
                ? 'shrink-0 flex gap-2 overflow-x-auto pb-1'
                : 'flex-1 min-h-0 overflow-y-auto grid gap-3 content-start'
            }
            style={enGrande ? undefined : { gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
          >
            {recuadros
              .filter((r) => r.id !== destacado)
              .map((r) => (
                <div key={r.id} className={enGrande ? 'w-40 shrink-0' : ''}>
                  <Recuadro {...r} onClick={() => setDestacado(r.id)} />
                </div>
              ))}
          </div>
        </div>

        {chatAbierto && (
          <ChatLlamada
            conversacionId={conversacionId}
            miIntegranteId={miIntegranteId}
            nombrePorId={new Map(personas.map((p) => [p.id, p.nombre]))}
            onCerrar={() => setChatAbierto(false)}
          />
        )}
      </div>

      <footer className="flex items-center justify-center gap-3 px-4 py-5 shrink-0">
        <Boton
          activo={micro}
          onClick={alternarMicro}
          etiqueta={micro ? 'Silenciar micrófono' : 'Activar micrófono'}
        >
          {micro ? <MicIcon className="size-5" /> : <MicOffIcon className="size-5" />}
        </Boton>

        <Boton
          activo={camara}
          onClick={alternarCamara}
          etiqueta={camara ? 'Apagar cámara' : 'Encender cámara'}
        >
          {camara ? <VideoIcon className="size-5" /> : <VideoOffIcon className="size-5" />}
        </Boton>

        {/* Compartir pantalla no existe en el navegador del teléfono: mostrar un
            botón que no puede funcionar es peor que no mostrarlo. */}
        <Boton
          activo={chatAbierto}
          onClick={() => setChatAbierto((v) => !v)}
          etiqueta={chatAbierto ? 'Cerrar el chat' : 'Abrir el chat'}
        >
          <MessageSquareIcon className="size-5" />
        </Boton>

        <Boton
          activo={compartiendo}
          onClick={alternarPantalla}
          etiqueta={compartiendo ? 'Dejar de compartir' : 'Compartir pantalla'}
          clase="hidden md:inline-flex"
        >
          {compartiendo ? <MonitorXIcon className="size-5" /> : <MonitorUpIcon className="size-5" />}
        </Boton>

        <button
          onClick={terminar}
          aria-label="Colgar"
          className="inline-flex size-14 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: 'oklch(55% 0.22 25)', color: 'white' }}
        >
          <PhoneOffIcon className="size-6" />
        </button>
      </footer>
    </div>
  )
}

interface BotonProps {
  activo: boolean
  onClick: () => void
  etiqueta: string
  clase?: string
  children: React.ReactNode
}

/** 56px de lado: pulsable con el pulgar sin apuntar. */
function Boton({ activo, onClick, etiqueta, clase = '', children }: BotonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      aria-pressed={activo}
      title={etiqueta}
      className={`inline-flex size-14 items-center justify-center rounded-full transition-transform active:scale-95 ${clase}`}
      style={{
        background: activo ? 'oklch(100% 0 0 / 12%)' : 'oklch(100% 0 0 / 4%)',
        color: activo ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
        border: '1px solid var(--tx-border)',
      }}
    >
      {children}
    </button>
  )
}

interface RecuadroProps {
  id: string
  stream: MediaStream | null
  nombre: string
  avatarUrl: string | null
  color: string | null
  micro: boolean
  camara: boolean
  compartiendo: boolean
  estado: ParticipanteVivo['estado']
  /** El propio video va mudo o se produce un acople insoportable. */
  silenciado?: boolean
  /** Ocupa la vista principal en vez de ir en la grilla. */
  grande?: boolean
  onClick?: () => void
}

function Recuadro({
  stream,
  nombre,
  avatarUrl,
  color,
  micro,
  camara,
  compartiendo,
  estado,
  silenciado = false,
  grande = false,
  onClick,
}: RecuadroProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // `srcObject` no se puede pasar como prop en JSX: es una referencia viva, no
  // una URL. Va por ref o el recuadro queda negro.
  useEffect(() => {
    const el = videoRef.current
    if (!el || el.srcObject === stream) return
    el.srcObject = stream
  }, [stream])

  const hayVideo = Boolean(stream) && (camara || compartiendo)

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      aria-label={onClick ? (grande ? `Volver a la grilla` : `Ver a ${nombre} en grande`) : undefined}
      className={`relative overflow-hidden rounded-xl ${grande ? 'size-full' : 'aspect-video'} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ background: 'oklch(14% 0.004 240)', border: '1px solid var(--tx-border)' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={silenciado}
        className={`size-full ${grande && compartiendo ? 'object-contain' : 'object-cover'}`}
        style={{ display: hayVideo ? 'block' : 'none' }}
      />

      {!hayVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <AvatarChat nombre={nombre} avatarUrl={avatarUrl} color={color} size={64} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2.5 py-2"
           style={{ background: 'linear-gradient(to top, oklch(0% 0 0 / 60%), transparent)' }}>
        {!micro && <MicOffIcon className="size-3.5 shrink-0 text-[oklch(75%_0.16_25)]" />}
        {compartiendo && <MonitorUpIcon className="size-3.5 shrink-0 text-[var(--tx-accent)]" />}
        <span className="text-[12px] font-medium text-white truncate">{nombre}</span>
      </div>

      {estado !== 'conectado' && (
        <div className="absolute inset-0 grid place-items-center"
             style={{ background: 'oklch(0% 0 0 / 45%)' }}>
          <span className="text-[12px] text-white">
            {estado === 'fallido' ? 'No se pudo conectar' : estado === 'reconectando' ? 'Reconectando…' : 'Conectando…'}
          </span>
        </div>
      )}
    </div>
  )
}
