'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  HeadphoneOffIcon,
  HeadphonesIcon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MonitorUpIcon,
  MonitorXIcon,
  PhoneOffIcon,
  Volume2Icon,
  VolumeXIcon,
  ShieldAlertIcon,
  VideoIcon,
  VideoOffIcon,
} from 'lucide-react'
import { AvatarChat } from '@/components/chat/avatar-chat'
import { ChatLlamada } from './chat-llamada'
import { useGrillaVideo } from './use-grilla-video'
import { useHablando } from './use-hablando'
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
   * Ensordecer: dejar de oír a todos. Como en Discord, también apaga el propio
   * micrófono -- si uno no está escuchando, seguir transmitiendo es hablarle a
   * una conversación que no sigue.
   */
  const [ensordecido, setEnsordecido] = useState(false)
  /** Para devolver el micrófono como estaba si se ensordeció con él prendido. */
  const microAntesRef = useRef(true)
  /**
   * Volumen por persona, de 0 a 1. Como en Discord.
   *
   * Sirve para lo que pasa de verdad en una llamada de equipo: uno tiene el
   * micrófono muy arriba y otro casi no se oye. Bajarle a uno es mejor que
   * pedirle que se arregle el micrófono a mitad de la conversación.
   */
  const [volumenes, setVolumenes] = useState<Map<string, number>>(() => new Map())
  /** De quién está abierto el control de volumen. */
  const [volumenAbierto, setVolumenAbierto] = useState<string | null>(null)
  /**
   * A quién silencié yo, solo para mí. Como en Discord: el otro sigue hablando
   * normalmente y el resto lo sigue oyendo — no se le impone nada a nadie.
   *
   * Va aparte del volumen en 0 para no perder el nivel que tenía: al quitarle el
   * silencio vuelve a como estaba, no a 100%.
   */
  const [silenciados, setSilenciados] = useState<Set<string>>(() => new Set())
  /**
   * A quién se está mirando en grande. `null` = todos parejos en la grilla.
   *
   * Con cinco recuadros del mismo tamaño no se lee una pantalla compartida ni se
   * le ve la cara a quien está hablando. Un clic lo agranda, otro lo devuelve.
   */
  const [destacado, setDestacado] = useState<string | null>(null)
  const {
    participantes,
    conexion,
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
  const enGrilla = recuadros.filter((r) => r.id !== destacado)

  // La caja real que le queda a los videos, ya descontado el chat si está
  // abierto. De acá sale el tamaño de cada recuadro.
  const cajaRef = useRef<HTMLDivElement>(null)
  const grilla = useGrillaVideo(cajaRef, enGrande ? 0 : enGrilla.length)

  const quienesHablan = useHablando(
    useMemo(
      () => participantes.map((p) => ({ id: p.integranteId, stream: p.stream })),
      [participantes],
    ),
  )

  /**
   * Si alguien empieza a compartir pantalla, se destaca solo.
   *
   * Es lo que hacen Meet y Discord, y por una razón práctica: nadie comparte
   * pantalla para que la miren en un recuadro de 200 píxeles. Un clic en
   * cualquier otro recuadro deshace la elección, así que no se le impone nada a
   * quien prefiera la grilla.
   */
  const compartiendoAhora = participantes.find((p) => p.compartiendo)?.integranteId ?? null
  useEffect(() => {
    if (compartiendoAhora) setDestacado(compartiendoAhora)
  }, [compartiendoAhora])

  /**
   * El audio de la llamada, separado de los recuadros.
   *
   * Tiene que estar acá y no dentro del video de cada recuadro: al minimizar se
   * desmontaba la grilla entera y con ella los `<video>` que reproducían el
   * sonido, así que la llamada se quedaba muda. Minimizar es justamente lo que
   * uno hace para seguir hablando mientras trabaja.
   *
   * Esta capa se renderiza en los tres estados -- llamada abierta, minimizada y
   * error -- así que el audio nunca depende de lo que se esté viendo.
   */
  const capaAudio = (
    <div className="sr-only" aria-hidden>
      {participantes.map((p) => (
        <AudioRemoto
          key={p.integranteId}
          stream={p.stream}
          mudo={ensordecido || silenciados.has(p.integranteId)}
          volumen={volumenes.get(p.integranteId) ?? 1}
        />
      ))}
    </div>
  )

  /**
   * Lo que se ve, según el estado. Es una variable y no un `return` temprano a
   * propósito.
   *
   * Antes cada estado tenía su propio `return`, y la capa de audio quedaba en una
   * posición distinta del árbol en cada uno. Para React eso no es "la misma capa
   * que se mueve": es una que se destruye y otra que nace. Cada minimizar y cada
   * restaurar desmontaba y recreaba todos los nodos de audio y sus AudioContext
   * -- de ahí el negro con "cargando" al reabrir.
   *
   * Con la capa siempre en el mismo lugar del árbol, el audio no se entera de
   * que la vista cambió.
   */
  let vista: React.ReactNode

  const alternarEnsordecer = () => {
    if (!ensordecido) {
      microAntesRef.current = micro
      if (micro) alternarMicro()
      setEnsordecido(true)
      return
    }
    setEnsordecido(false)
    // Solo se devuelve el micrófono si estaba prendido antes: si uno ya estaba
    // en silencio y ensordeció, al volver no hay que abrirle el micrófono sin
    // que lo pida.
    if (microAntesRef.current && !micro) alternarMicro()
  }

  if (error) {
    vista = (
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
  // Minimizado: una barra fina para volver. Sin esto, atender una llamada
  // significa no poder usar el CRM, que es justo lo contrario de lo que se busca.
  } else if (minimizado) {
    vista = (
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
          {ensordecido ? 'Ensordecido' : 'En llamada'} · {participantes.length + 1}
        </span>
      </button>
    )
  } else {
    vista = (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: 'oklch(8% 0.004 240 / 96%)', backdropFilter: 'blur(24px)' }}
      role="dialog"
      aria-label={`Llamada en ${titulo}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--tx-ink-primary)] truncate">{titulo}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--tx-ink-muted)]">
            <span>
              {participantes.length === 0
                ? 'Esperando a que entren…'
                : `${participantes.length + 1} en la llamada`}
            </span>

            {/* Directa o por relay. No es un detalle técnico: una llamada directa
                no toca ningún servidor y no consume nada; una por relay sale de
                los 1.000 GB gratis. Verlo en el momento evita tener que deducirlo
                después mirando un panel de Cloudflare. */}
            {conexion && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={
                  conexion === 'directa'
                    ? { background: 'oklch(62% 0.17 150 / 18%)', color: 'oklch(75% 0.16 150)' }
                    : { background: 'oklch(70% 0.15 75 / 18%)', color: 'oklch(80% 0.13 75)' }
                }
                title={
                  conexion === 'directa'
                    ? 'El audio y el video van directo entre navegadores. No consume nada.'
                    : 'Pasa por un servidor de retransmisión. Consume de los 1.000 GB gratis al mes.'
                }
              >
                {conexion === 'directa' ? 'Directa · $0' : 'Por relay'}
              </span>
            )}
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
              <Recuadro
                {...enGrande}
                grande
                hablando={quienesHablan.has(enGrande.id)}
                volumen={enGrande.id === miIntegranteId ? null : (volumenes.get(enGrande.id) ?? 1)}
                silenciado={silenciados.has(enGrande.id)}
                onSilenciar={() =>
                  setSilenciados((s) => {
                    const n = new Set(s)
                    if (n.has(enGrande.id)) n.delete(enGrande.id)
                    else n.add(enGrande.id)
                    return n
                  })
                }
                volumenAbierto={volumenAbierto === enGrande.id}
                onAbrirVolumen={() => setVolumenAbierto((v) => (v === enGrande.id ? null : enGrande.id))}
                onVolumen={(v) => setVolumenes((m) => new Map(m).set(enGrande.id, v))}
                onClick={() => setDestacado(null)}
              />
            </div>
          )}

          {/* La grilla. Flex con wrap y centrado, no CSS grid: con el tamaño ya
              calculado, el wrap deja la última fila centrada sola -- que es
              exactamente el detalle que hace que se vea como Meet. */}
          <div
            ref={cajaRef}
            className={
              enGrande
                ? 'shrink-0 flex gap-2 overflow-x-auto pb-1'
                : 'flex-1 min-h-0 flex flex-wrap items-center justify-center content-center gap-3 overflow-hidden'
            }
          >
            {enGrilla.map((r) => (
              <div
                key={r.id}
                className={enGrande ? 'w-40 shrink-0' : 'shrink-0'}
                style={
                  enGrande
                    ? undefined
                    : { width: grilla.ancho || undefined, height: grilla.alto || undefined }
                }
              >
                <Recuadro
                  {...r}
                  hablando={quienesHablan.has(r.id)}
                  volumen={r.id === miIntegranteId ? null : (volumenes.get(r.id) ?? 1)}
                  silenciado={silenciados.has(r.id)}
                  onSilenciar={() =>
                    setSilenciados((s) => {
                      const n = new Set(s)
                      if (n.has(r.id)) n.delete(r.id)
                      else n.add(r.id)
                      return n
                    })
                  }
                  volumenAbierto={volumenAbierto === r.id}
                  onAbrirVolumen={() => setVolumenAbierto((v) => (v === r.id ? null : r.id))}
                  onVolumen={(v) => setVolumenes((m) => new Map(m).set(r.id, v))}
                  onClick={() => setDestacado(r.id)}
                />
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
          activo={!ensordecido}
          onClick={alternarEnsordecer}
          etiqueta={ensordecido ? 'Volver a escuchar' : 'Ensordecer: dejar de oír a todos'}
        >
          {ensordecido ? <HeadphoneOffIcon className="size-5" /> : <HeadphonesIcon className="size-5" />}
        </Boton>

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

  // La capa de audio va SIEMPRE en el mismo lugar del árbol, hermana de la vista
  // y nunca dentro de ella. Es lo que hace que minimizar y restaurar no la
  // desmonte: React solo reconcilia `vista`, y el audio ni se entera.
  return (
    <>
      {capaAudio}
      {vista}
    </>
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
  /** Ocupa la vista principal en vez de ir en la grilla. */
  grande?: boolean
  /** Está hablando ahora: se le enciende el borde. */
  hablando?: boolean
  /** null para el propio recuadro: uno no se sube el volumen a sí mismo. */
  volumen?: number | null
  volumenAbierto?: boolean
  /** Silenciado solo para mí. El resto lo sigue oyendo. */
  silenciado?: boolean
  onSilenciar?: () => void
  onAbrirVolumen?: () => void
  onVolumen?: (v: number) => void
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
  grande = false,
  hablando = false,
  volumen = null,
  volumenAbierto = false,
  silenciado = false,
  onSilenciar,
  onAbrirVolumen,
  onVolumen,
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
      className={`relative overflow-hidden rounded-xl ${grande ? 'size-full' : 'size-full'} ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        background: 'oklch(14% 0.004 240)',
        // El borde de "está hablando" reemplaza al normal en vez de sumarse: si
        // engrosara el recuadro, todo se movería un pixel cada vez que alguien
        // abre la boca.
        border: hablando ? '2px solid oklch(72% 0.17 150)' : '2px solid var(--tx-border)',
        transition: 'border-color 120ms ease',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
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
        <span className="flex-1 text-[12px] font-medium text-white truncate">{nombre}</span>

        {/* Volumen de esta persona. El `stopPropagation` es necesario: sin él,
            tocar el control también destacaría el recuadro. */}
        {volumen !== null && onAbrirVolumen && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAbrirVolumen()
            }}
            aria-label={`Volumen de ${nombre}`}
            title={`Volumen de ${nombre}`}
            className="shrink-0 p-1 text-white/70 hover:text-white"
          >
            {silenciado || volumen === 0 ? (
              <VolumeXIcon className="size-3.5 text-[oklch(75%_0.16_25)]" />
            ) : (
              <Volume2Icon className="size-3.5" />
            )}
          </button>
        )}
      </div>

      {volumen !== null && volumenAbierto && onVolumen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-2 bottom-10 flex items-center gap-2 rounded-lg px-2.5 py-2"
          style={{ background: 'oklch(12% 0.004 240 / 92%)', border: '1px solid var(--tx-border)' }}
        >
          {/* Silenciar a esta persona solo para mí. Es lo primero del control
              porque es la acción más común: alguien deja el micrófono abierto en
              un lugar ruidoso y uno quiere seguir la reunión igual. */}
          {onSilenciar && (
            <button
              onClick={onSilenciar}
              aria-pressed={silenciado}
              aria-label={silenciado ? `Volver a oír a ${nombre}` : `Silenciar a ${nombre} solo para mí`}
              title={silenciado ? 'Volver a oír' : 'Silenciar solo para mí'}
              className="shrink-0 rounded px-1.5 py-1"
              style={{ color: silenciado ? 'oklch(75% 0.16 25)' : 'rgba(255,255,255,0.6)' }}
            >
              {silenciado ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
            </button>
          )}
          <input
            type="range"
            min={0}
            max={200}
            value={Math.round(volumen * 100)}
            onChange={(e) => onVolumen(Number(e.target.value) / 100)}
            disabled={silenciado}
            aria-label={`Volumen de ${nombre}`}
            className="flex-1 accent-[var(--tx-accent)] disabled:opacity-40"
          />
          {/* Hasta 200%: el caso real no es bajarle a quien grita, es subirle a
              quien tiene un micrófono malo y no se le entiende. */}
          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/70">
            {Math.round(volumen * 100)}%
          </span>
        </div>
      )}

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

/**
 * El sonido de una persona, sin nada que mostrar.
 *
 * Existe aparte del recuadro por una razón concreta: al minimizar la llamada se
 * desmontan los recuadros, y si el audio viviera dentro de ellos se cortaría —
 * justo cuando uno minimiza para seguir hablando mientras hace otra cosa.
 *
 * `srcObject` va por ref y no como prop: es una referencia viva, no una URL.
 */
/**
 * Un solo contexto de audio para toda la llamada, compartido.
 *
 * Antes cada participante creaba el suyo. Chrome limita a unos seis por página,
 * y con el vaivén de minimizar y restaurar se creaban y destruían sin parar --
 * al llegar al tope, `new AudioContext()` falla y el `catch` se lo tragaba: el
 * síntoma era dejar de oír a alguien sin ningún error a la vista, y encima
 * asimétrico (el otro te oye, tú a él no), porque el que se rompía era el
 * reproductor de un solo lado.
 *
 * Es a nivel de módulo y no un ref porque tiene que sobrevivir a que el panel se
 * desmonte y se vuelva a montar. No se cierra nunca: un AudioContext en reposo
 * no cuesta nada, y cerrarlo es justamente lo que causaba el problema.
 */
let ctxCompartido: AudioContext | null = null

function contextoAudio(): AudioContext | null {
  if (ctxCompartido && ctxCompartido.state !== 'closed') {
    void ctxCompartido.resume().catch(() => {})
    return ctxCompartido
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctxCompartido = new Ctor()
    void ctxCompartido.resume().catch(() => {})
    return ctxCompartido
  } catch {
    return null
  }
}

function AudioRemoto({
  stream,
  mudo,
  volumen,
}: {
  stream: MediaStream | null
  mudo: boolean
  volumen: number
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const gananciaRef = useRef<GainNode | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.srcObject === stream) return
    el.srcObject = stream
  }, [stream])

  /**
   * El volumen pasa por WebAudio y no por `el.volume`, que está limitado a 1:
   * con él no se puede subir a alguien por encima de lo que grabó su micrófono,
   * y ése es el caso que importa -- al que grita se le baja, pero al que no se le
   * entiende hay que subirle.
   *
   * El elemento `<audio>` se queda mudo pero presente: en Chrome hace falta tener
   * el stream enganchado a un elemento para que el audio de WebRTC fluya, aunque
   * el sonido salga por otro lado.
   */
  useEffect(() => {
    const el = ref.current
    if (!el || !stream || stream.getAudioTracks().length === 0) return

    const ctx = contextoAudio()
    if (!ctx) {
      // Sin WebAudio se cae al camino simple, con el techo del 100%. Y se dice
      // acá arriba en el elemento, no se queda en silencio sin explicación.
      el.muted = false
      el.volume = Math.min(1, volumen)
      return
    }

    let fuente: MediaStreamAudioSourceNode
    let ganancia: GainNode
    try {
      fuente = ctx.createMediaStreamSource(stream)
      ganancia = ctx.createGain()
    } catch {
      el.muted = false
      el.volume = Math.min(1, volumen)
      return
    }

    ganancia.gain.value = mudo ? 0 : volumen
    fuente.connect(ganancia)
    ganancia.connect(ctx.destination)
    gananciaRef.current = ganancia

    return () => {
      gananciaRef.current = null
      try {
        fuente.disconnect()
        ganancia.disconnect()
      } catch {
        // Ya desconectado.
      }
      // El contexto NO se cierra: es compartido y lo siguen usando los demás.
    }
    // Solo se rearma si cambia el stream: mover el control de volumen no debe
    // reconstruir el grafo de audio, para eso está el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream])

  useEffect(() => {
    const g = gananciaRef.current
    if (g) g.gain.value = mudo ? 0 : volumen
    else if (ref.current) ref.current.volume = mudo ? 0 : Math.min(1, volumen)
  }, [volumen, mudo])

  return <audio ref={ref} autoPlay playsInline muted />
}
