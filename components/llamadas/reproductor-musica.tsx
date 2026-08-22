'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ListMusicIcon,
  Maximize2Icon,
  Minimize2Icon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  SearchIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
  UsersIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react'
import {
  hayQueSaltar,
  pistaActual,
  posicionActual,
  reloj,
  type Pista,
} from '@/lib/types/musica'
import type { Musica } from './use-musica'

/**
 * El reproductor de la sala.
 *
 * Dos reglas que NO son preferencias de diseño y no hay que "optimizar":
 *
 *  1. El iframe de YouTube tiene un viewport de 200×200 px como mínimo y está a
 *     la vista. Es requisito de los términos de la API (Required Minimum
 *     Functionality: https://developers.google.com/youtube/terms/required-minimum-functionality).
 *     Esconderlo con display:none, 1×1 px u opacidad 0 rompe los términos y es
 *     por lo que a Groovy y a Rythm les cerraron el acceso.
 *  2. El audio sale del reproductor oficial. Nunca se extrae la pista ni se
 *     reproduce por otro camino.
 *
 * La sincronización no la hace este componente: lee la posición que calcula
 * `posicionActual` a partir de la sala y corrige solo cuando el desfase se nota.
 */

/**
 * Mínimo exigido por los términos de la API. No bajar de acá -- ni siquiera
 * dentro de la tarjeta minimizada (`PipLlamada`, que importa esta constante
 * para no achicar el video de música por debajo de esto al calcular su alto).
 */
export const LADO_MINIMO = 200

/**
 * En iOS el volumen de cualquier audio web lo manda el botón físico y nada más:
 * `setVolume` no falla, simplemente no hace nada, y leerlo devuelve siempre 1.
 * Es una restricción del sistema operativo, no de la API de YouTube ni de acá.
 *
 * Importa porque un slider que no mueve nada es peor que no tener slider: quien
 * lo arrastra cree que la app está rota. Detectarlo permite decirlo.
 *
 * `maxTouchPoints` va porque el iPad se declara Mac desde iPadOS 13 y con solo
 * mirar el userAgent se cuela como escritorio.
 */
function volumenLoMandaElTelefono(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Música de fondo mientras se trabaja, no un concierto. */
const VOLUMEN_INICIAL = 30

/** Cada cuánto se compara la aguja local con la de la sala. */
const REVISION_MS = 1000

interface ReproductorMusicaProps {
  musica: Musica
  onCerrar: () => void
  /** 0 a 1, donde 1 es el volumen normal de las voces. */
  volumenVoces: number
  onVolumenVoces: (valor: number) => void
  /**
   * Controlado desde afuera porque el tamaño del panel decide cuánto espacio le
   * queda a la grilla de video, y de eso se encarga el panel de la llamada.
   *
   *  - `encogido`: columna angosta, solo el video y los controles
   *  - `normal`:   columna con cola, buscador y volúmenes
   *  - `grande`:   el video toma el área principal y la gente pasa a la tira
   */
  tamano: TamanoMusica
  onTamano: (valor: TamanoMusica) => void
  /**
   * Dentro de la tarjeta minimizada (`PipLlamada`): solo el video, sin
   * cabecera ni controles. `tamano` sigue siendo el que tenía antes de
   * minimizar -- sin este modo aparte, un video en `encogido`/`normal`
   * mostraría cabecera + título + volúmenes + cola apretados en una tarjeta
   * de 124px de alto en vez del video solo.
   */
  compacto?: boolean
}

export type TamanoMusica = 'encogido' | 'normal' | 'grande'

// ── Tipos mínimos del IFrame Player API ────────────────────────────────────
// Se declaran acá y no se instala un paquete de tipos: la superficie que se usa
// son seis métodos y traer una dependencia entera por eso es peor negocio.

interface YTPlayer {
  loadVideoById(opciones: { videoId: string; startSeconds?: number }): void
  seekTo(segundos: number, exacto: boolean): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  setVolume(volumen: number): void
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

interface YTApi {
  Player: new (
    elemento: HTMLElement,
    opciones: {
      height: string
      width: string
      playerVars: Record<string, string | number>
      events: {
        onReady?: () => void
        onStateChange?: (evento: { data: number }) => void
        onError?: () => void
      }
    },
  ) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
}

declare global {
  interface Window {
    YT?: YTApi
    onYouTubeIframeAPIReady?: () => void
  }
}

/**
 * Carga el script del IFrame API una sola vez por pestaña.
 *
 * Va por `<script>` y no como dependencia de npm porque YouTube exige que el
 * reproductor lo sirva su propio dominio: un paquete que lo empaquete sería una
 * copia que puede quedar desactualizada y romperse sin aviso.
 */
let cargando: Promise<YTApi> | null = null

function cargarApiYouTube(): Promise<YTApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Solo en el navegador'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (cargando) return cargando

  const promesa = new Promise<YTApi>((resolver, rechazar) => {
    const anterior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      anterior?.()
      if (window.YT?.Player) resolver(window.YT)
      else rechazar(new Error('El reproductor de YouTube no cargó'))
    }

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    tag.onerror = () => rechazar(new Error('No se pudo cargar el reproductor de YouTube'))
    document.head.appendChild(tag)
  })

  // Si falla (hipo de red, script bloqueado), hay que soltar la promesa
  // cacheada: si no, un fallo transitorio deja la música rota para siempre
  // en esta pestaña, porque la próxima llamada reusaría la misma promesa
  // ya rechazada.
  promesa.catch(() => { cargando = null })

  cargando = promesa
  return promesa
}

export function ReproductorMusica({
  musica,
  onCerrar,
  volumenVoces,
  onVolumenVoces,
  tamano,
  onTamano,
  compacto = false,
}: ReproductorMusicaProps) {
  const encogido = tamano === 'encogido'
  const grande = tamano === 'grande'
  // Todo lo que es cabecera/título/volúmenes/cola se oculta igual en
  // `grande` que en `compacto` -- las dos apuestan el espacio entero al
  // video. La diferencia es que `grande` sigue mostrando sus propios
  // controles flotantes (achicar, pantalla completa, cerrar); `compacto`
  // no muestra ninguno, porque vive dentro de la tarjeta minimizada, que ya
  // tiene los suyos.
  const chromeMinimo = grande || compacto
  const { sala, aviso, limpiarAviso, ejecutar, poner, alTerminar } = musica

  /**
   * `grande` agranda el video DENTRO del panel de la llamada, pero el panel
   * mismo comparte pantalla con la grilla de gente y el chat -- nunca llega
   * a ocupar todo. Pantalla completa real es otra cosa: mismo mecanismo que
   * ya se usa para la pantalla compartida (`panel-llamada.tsx`, `Recuadro`),
   * sobre este `<aside>` entero para que los controles (que viven adentro)
   * sigan alcanzables en fullscreen -- si fuera solo sobre el iframe, la
   * Fullscreen API muestra nada más que el subárbol de ESE elemento y los
   * controles quedan inalcanzables.
   */
  const raizRef = useRef<HTMLElement>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [listo, setListo] = useState(false)
  const [volumen, setVolumen] = useState(VOLUMEN_INICIAL)
  /**
   * Se calcula una sola vez al montar. No hay riesgo de descalce con el servidor:
   * este componente solo existe dentro de una llamada ya abierta, que es una
   * pantalla a la que se llega interactuando, nunca renderizada de entrada.
   */
  const [sinControlDeVolumen] = useState(volumenLoMandaElTelefono)
  /**
   * El navegador exige un gesto del usuario para que algo suene. Si el arranque
   * automático falla se muestra un botón: quedarse en silencio sin explicar nada
   * es la peor de las opciones, porque parece que la función está rota.
   */
  const [necesitaGesto, setNecesitaGesto] = useState(false)
  const [errorApi, setErrorApi] = useState<string | null>(null)
  const [enFullscreen, setEnFullscreen] = useState(false)
  const [buscador, setBuscador] = useState(false)

  const actual = pistaActual(sala)

  // El callback del reproductor no se rearma en cada render: sin ref leería la
  // versión de la primera vuelta.
  const alTerminarRef = useRef(alTerminar)
  useEffect(() => {
    alTerminarRef.current = alTerminar
  }, [alTerminar])

  // ── Montaje del reproductor ──────────────────────────────────────────────
  useEffect(() => {
    let vivo = true

    cargarApiYouTube()
      .then((YT) => {
        if (!vivo || !contenedorRef.current || playerRef.current) return

        playerRef.current = new YT.Player(contenedorRef.current, {
          height: String(LADO_MINIMO),
          width: String(LADO_MINIMO),
          playerVars: {
            // `playsinline` es obligatorio en iOS: sin esto el video se abre en
            // pantalla completa y tapa la llamada entera.
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            // Sin controles propios: el estado lo manda la sala, no este cliente.
            // Si alguien pausara con el control del iframe, se desincronizaría de
            // los demás sin que nadie lo note.
            controls: 0,
            disablekb: 1,
          },
          events: {
            onReady: () => {
              if (!vivo) return
              playerRef.current?.setVolume(VOLUMEN_INICIAL)
              setListo(true)
            },
            onStateChange: (evento) => {
              if (evento.data === YT.PlayerState.ENDED) void alTerminarRef.current()
              if (evento.data === YT.PlayerState.PLAYING) setNecesitaGesto(false)
            },
            onError: () => {
              // Un video que no se puede reproducir trabaría la cola para siempre:
              // el final nunca llega y nadie avanza. Se salta solo.
              void alTerminarRef.current()
            },
          },
        })
      })
      .catch((err: Error) => {
        if (vivo) setErrorApi(err.message)
      })

    return () => {
      vivo = false
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (listo) playerRef.current?.setVolume(volumen)
  }, [volumen, listo])

  // ── Cargar la pista que manda la sala ────────────────────────────────────
  const cargadoRef = useRef<string | null>(null)

  useEffect(() => {
    const player = playerRef.current
    if (!listo || !player) return

    if (!sala.video_id) {
      if (cargadoRef.current) {
        player.stopVideo()
        cargadoRef.current = null
      }
      return
    }

    if (cargadoRef.current === sala.video_id) return
    cargadoRef.current = sala.video_id

    // Se entra por donde va el resto, no por el segundo cero: quien llega tarde a
    // la llamada se engancha a mitad de la canción, como quien entra a una pieza
    // donde ya suena algo.
    player.loadVideoById({
      videoId: sala.video_id,
      startSeconds: Math.floor(posicionActual(sala, new Date())),
    })

    if (sala.pausado) player.pauseVideo()
  }, [listo, sala])

  // ── Pausa y reanudación que vienen de otro cliente ───────────────────────
  useEffect(() => {
    const player = playerRef.current
    if (!listo || !player || !sala.video_id) return

    if (sala.pausado) {
      player.pauseVideo()
      return
    }

    const intento = player.playVideo() as unknown
    void intento
  }, [listo, sala.pausado, sala.video_id])

  // ── La corrección: el único lugar donde se toca la aguja ─────────────────
  useEffect(() => {
    if (!listo || !sala.video_id || sala.pausado) return

    const revisar = () => {
      const player = playerRef.current
      if (!player) return

      const esperada = posicionActual(sala, new Date())
      const propia = player.getCurrentTime()

      // Solo si el desfase ya se nota. Un `seekTo` constante corta el audio y lo
      // retoma: suena mucho peor que ir 300 ms desalineado con la pieza de al lado.
      if (hayQueSaltar(propia, esperada)) player.seekTo(esperada, true)

      // El navegador bloqueó el arranque automático. Se pide el gesto en vez de
      // dejar a la persona mirando un recuadro mudo.
      if (player.getPlayerState() !== 1 && !sala.pausado) setNecesitaGesto(true)
    }

    const t = setInterval(revisar, REVISION_MS)
    revisar()
    return () => clearInterval(t)
  }, [listo, sala])

  // El aviso de un comando se desvanece solo: es una confirmación, no un estado.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(limpiarAviso, 5000)
    return () => clearTimeout(t)
  }, [aviso, limpiarAviso])

  // Se puede salir de pantalla completa con Esc, no solo con el botón -- hay
  // que enterarse igual para volver a mostrar la cabecera y los controles.
  useEffect(() => {
    const alCambiar = () => setEnFullscreen(document.fullscreenElement === raizRef.current)
    document.addEventListener('fullscreenchange', alCambiar)
    return () => document.removeEventListener('fullscreenchange', alCambiar)
  }, [])

  // Si el panel se desmonta (se cierra la música, o toda la llamada) estando
  // en pantalla completa, sin esto el navegador queda "atrapado" mostrando
  // un elemento que React ya se llevó -- mismo caso que ya se arregló para
  // la pantalla compartida (panel-llamada.tsx).
  useEffect(() => {
    const el = raizRef.current
    return () => {
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  const posicion = actual ? Math.floor(posicionActual(sala, new Date())) : 0

  return (
    /* Sin ancho propio: lo decide el hueco que le reserva el panel de la llamada,
       que es el que sabe cuánto espacio le queda a la grilla de video. */
    <aside
      ref={raizRef}
      className="relative flex flex-col min-h-0 size-full shrink-0 overflow-y-auto"
      style={{ borderLeft: '1px solid var(--tx-border)', background: 'oklch(10% 0.004 240 / 92%)' }}
      aria-label="Música de la llamada"
    >
      {/* En grande la cabecera se reduce a lo esencial (cerrar, achicar,
          pantalla completa) y sin fondo -- el video es lo que importa, no
          los botones. En encogido/normal se queda como estaba. En compacto
          (dentro de la tarjeta minimizada) no hay cabecera de ningún tipo:
          esa tarjeta ya tiene sus propios controles. */}
      {!compacto && (
      <header
        className={`flex items-center justify-between px-3 shrink-0 ${grande ? 'absolute inset-x-0 top-0 z-10 pb-6 pt-3' : 'py-2.5'}`}
        style={{
          borderBottom: grande ? 'none' : '1px solid var(--tx-border)',
          background: grande
            ? 'linear-gradient(to bottom, oklch(0% 0 0 / 85%) 0%, oklch(0% 0 0 / 85%) 40%, transparent 100%)'
            : undefined,
        }}
      >
        {!grande && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--tx-ink-primary)]">
            <MusicIcon className="size-4" aria-hidden />
            Música
          </p>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {!encogido && !grande && (
            <button
              onClick={() => setBuscador((v) => !v)}
              aria-label={buscador ? 'Cerrar el buscador' : 'Buscar música'}
              aria-pressed={buscador}
              className="p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
            >
              <SearchIcon className="size-4" />
            </button>
          )}
          {/* Pantalla completa real (Fullscreen API), aparte de "grande": ver
              el comentario de `raizRef`. Solo tiene sentido con el video ya
              agrandado. */}
          {grande && (
            <button
              onClick={() => {
                if (enFullscreen) {
                  void document.exitFullscreen().catch(() => {})
                } else {
                  raizRef.current?.requestFullscreen().catch(() => {
                    /* el navegador negó el pedido; se sigue viendo en grande igual. */
                  })
                }
              }}
              aria-label={enFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="p-1 text-white/80 hover:text-white"
            >
              <Maximize2Icon className="size-4" />
            </button>
          )}
          {/* Achicar y agrandar son dos botones y no un ciclo de tres estados:
              con un solo botón hay que acordarse de qué viene después, y la
              mitad de las veces se pasa de largo y hay que dar la vuelta. */}
          {!encogido && (
            <button
              onClick={() => {
                if (enFullscreen) void document.exitFullscreen().catch(() => {})
                onTamano(grande ? 'normal' : 'encogido')
                // Con el panel encogido el buscador no se ve; dejarlo abierto haría
                // que reapareciera solo al extender, sin que nadie lo pidiera.
                setBuscador(false)
              }}
              aria-label={grande ? 'Volver el video a la columna' : 'Encoger el panel de música'}
              className={`p-1 ${grande ? 'text-white/80 hover:text-white' : 'text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]'}`}
            >
              <Minimize2Icon className="size-4" />
            </button>
          )}
          {!grande && (
            <button
              onClick={() => onTamano(encogido ? 'normal' : 'grande')}
              aria-label={encogido ? 'Extender el panel de música' : 'Agrandar el video'}
              className="p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
            >
              <Maximize2Icon className="size-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (enFullscreen) void document.exitFullscreen().catch(() => {})
              onCerrar()
            }}
            aria-label="Cerrar el panel de música"
            className={`p-1 ${grande ? 'text-white/80 hover:text-white' : 'text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]'}`}
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </header>
      )}

      {/*
        El reproductor. 200×200 px visibles: es el mínimo que exigen los términos
        de la YouTube API, no una decisión estética. No reducir, no ocultar.
      */}
      <div className={chromeMinimo ? 'flex-1 min-h-0 flex' : 'flex justify-center px-3 pt-3 shrink-0'}>
        <div
          className={`relative overflow-hidden rounded-lg ${chromeMinimo ? 'w-full h-full' : ''}`}
          style={{
            // El video toma todo el hueco disponible; en los otros dos
            // tamaños se queda en el cuadrado mínimo, que es el piso que
            // exigen los términos -- ese piso NO se salta ni en compacto,
            // por eso el ancla que le reserva la tarjeta minimizada
            // (`PipLlamada`) usa esta misma constante para no pedirle menos.
            width: chromeMinimo ? undefined : LADO_MINIMO,
            height: chromeMinimo ? undefined : LADO_MINIMO,
            minWidth: LADO_MINIMO,
            minHeight: LADO_MINIMO,
            background: 'oklch(14% 0.004 240)',
            border: '1px solid var(--tx-border)',
          }}
        >
          {/* El iframe se crea con width y height de 200 como atributos: la API
              los escribe en el elemento, no en una clase. Sin forzarlos por CSS,
              agrandar el panel dejaba el video chico en una esquina negra. */}
          <div ref={contenedorRef} className="size-full [&_iframe]:size-full [&_iframe]:block" />

          {!actual && !errorApi && (
            <div className="absolute inset-0 grid place-items-center px-3 text-center">
              <p className="text-[12px] text-[var(--tx-ink-muted)]">
                Nada sonando. Busca algo o escribe <code>/play</code> en el chat.
              </p>
            </div>
          )}

          {errorApi && (
            <div className="absolute inset-0 grid place-items-center px-3 text-center">
              <p className="text-[12px] text-[var(--tx-ink-muted)]">{errorApi}</p>
            </div>
          )}

          {necesitaGesto && actual && (
            <button
              onClick={() => {
                playerRef.current?.playVideo()
                setNecesitaGesto(false)
              }}
              className="absolute inset-0 grid place-items-center gap-2 text-[12px] font-medium"
              style={{ background: 'oklch(8% 0.004 240 / 80%)', color: 'var(--tx-ink-primary)' }}
            >
              <PlayIcon className="size-8" aria-hidden />
              {/* El navegador no deja sonar nada sin un gesto de la persona. */}
              Toca para escuchar
            </button>
          )}
        </div>
      </div>

      {actual && !chromeMinimo && (
        <div className="px-3 pt-3 shrink-0">
          {/* Encogido queda solo el título: es lo único que se pregunta de un
              vistazo ("¿qué está sonando?"). El canal y el reloj están en el
              propio reproductor de YouTube, ahí arriba. */}
          <p
            className={`text-[13px] font-medium text-[var(--tx-ink-primary)] ${
              encogido ? 'truncate' : 'line-clamp-2'
            }`}
          >
            {actual.titulo}
          </p>
          {!encogido && (
            <>
              <p className="text-[11px] text-[var(--tx-ink-muted)] truncate">{actual.canal}</p>
              <p className="mt-1 text-[11px] tabular-nums text-[var(--tx-ink-muted)]">
                {reloj(posicion)} / {reloj(actual.duracion_seg)}
              </p>
            </>
          )}
        </div>
      )}

      {/* `flex-wrap`: encogido son 224 px y los seis botones quedan al filo. Que
          bajen a una segunda fila es mejor que verlos recortados.
          En grande, flota sobre el borde inferior del video en vez de
          ocupar una fila propia -- eso es lo que le devuelve al video el
          alto entero, en vez de repartirlo con cabecera + título + estos
          controles + volumen + cola, todo apilado y comiéndose el video. */}
      {/* En compacto (tarjeta minimizada) no hay controles de ningún tipo:
          esa tarjeta pidió ver solo el video, sus propios botones son los de
          la llamada (mic, cámara, colgar), no los de la música. */}
      {!compacto && (
      <div
        className={`flex flex-wrap items-center justify-center gap-1 px-3 shrink-0 ${
          grande ? 'absolute inset-x-0 bottom-0 z-10 pt-6 pb-3' : 'py-3'
        }`}
        style={
          grande
            ? {
                // Un video puede traer subtítulos quemados cerca del borde
                // inferior (pasó en vivo: tapaban los botones y viceversa).
                // Degradé más largo y sólido del todo al final, no solo un
                // tinte parejo, para que los controles se lean pase lo que
                // pase debajo.
                background:
                  'linear-gradient(to top, oklch(0% 0 0 / 85%) 0%, oklch(0% 0 0 / 85%) 40%, transparent 100%)',
              }
            : undefined
        }
      >
        <BotonMini onClick={() => void ejecutar('previous')} etiqueta="Anterior">
          <SkipBackIcon className="size-4" />
        </BotonMini>

        <BotonMini
          onClick={() => void ejecutar(sala.pausado ? 'resume' : 'pause')}
          etiqueta={sala.pausado ? 'Reanudar' : 'Pausar'}
          destacado
        >
          {sala.pausado ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        </BotonMini>

        <BotonMini onClick={() => void ejecutar('skip')} etiqueta="Siguiente">
          <SkipForwardIcon className="size-4" />
        </BotonMini>

        <BotonMini onClick={() => void ejecutar('shuffle')} etiqueta="Mezclar la cola">
          <ShuffleIcon className="size-4" />
        </BotonMini>

        <BotonMini
          onClick={() => void ejecutar('loop')}
          etiqueta={`Repetición: ${sala.modo_loop}`}
          activo={sala.modo_loop !== 'off'}
        >
          {sala.modo_loop === 'pista' ? <Repeat1Icon className="size-4" /> : <RepeatIcon className="size-4" />}
        </BotonMini>

        <BotonMini onClick={() => void ejecutar('stop')} etiqueta="Detener y vaciar la cola">
          <SquareIcon className="size-4" />
        </BotonMini>
      </div>
      )}

      {/*
        Volumen propio, aparte del de las voces. La música es de fondo: si
        compartiera control con la llamada, bajarla para escuchar a alguien
        bajaría también a la persona que habla.
      */}
      {/*
        En iPhone y iPad no se dibuja el slider de música. No es que se prefiera
        esconderlo: ahí `setVolume` no hace nada y el control se quedaba quieto
        mientras la música seguía igual de fuerte -- se ve como una app rota. Se
        dice qué pasa y se deja el de voces, que sí funciona porque pasa por
        WebAudio y no por el volumen del sistema.
      */}
      {!encogido &&
        !chromeMinimo &&
        (sinControlDeVolumen ? (
          <p className="px-3 pb-3 shrink-0 text-[11px] text-[var(--tx-ink-muted)]">
            El volumen de la música lo maneja el botón del teléfono: iOS no deja que
            una web lo cambie. Para escucharla mejor, baja las voces acá abajo.
          </p>
        ) : (
          <div className="flex items-center gap-2 px-3 pb-3 shrink-0">
            <Volume2Icon className="size-4 shrink-0 text-[var(--tx-ink-muted)]" aria-hidden />
            <input
              type="range"
              min={0}
              max={100}
              value={volumen}
              onChange={(e) => setVolumen(Number(e.target.value))}
              aria-label="Volumen de la música"
              className="flex-1 accent-[var(--tx-accent)]"
            />
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--tx-ink-muted)]">
              {volumen}%
            </span>
          </div>
        ))}

      {/*
        Bajar las voces, que es la única forma real de que la música se oiga más.
        El audio sale del iframe de YouTube, que es cross-origin: no se puede
        enganchar a WebAudio ni pasarle un GainNode, y `setVolume` recorta
        cualquier valor sobre 100. Sacar la pista por otro camino para
        amplificarla es justo lo que hace que YouTube cierre el acceso a la API.

        Las voces sí pasan por WebAudio, así que atenuarlas es la palanca que
        queda: se baja acá y se sube el volumen del sistema. El volumen por
        persona sigue mandando encima de éste -- a quien no se le entiende se le
        puede subir igual.
      */}
      {!encogido && !chromeMinimo && (
        <div className="flex items-center gap-2 px-3 pb-3 shrink-0">
          {/* No es un ícono de micrófono a propósito: esto no controla el
              propio mic, atenúa la voz de TODOS los demás para escuchar la
              música mejor. Con MicIcon (como estaba antes) parecía un
              control del propio micrófono, y Vicho lo reportó como "no
              sirve para nada" -- confundido con qué hacía. */}
          <UsersIcon className="size-4 shrink-0 text-[var(--tx-ink-muted)]" aria-hidden />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volumenVoces * 100)}
            onChange={(e) => onVolumenVoces(Number(e.target.value) / 100)}
            aria-label="Volumen de las voces"
            className="flex-1 accent-[var(--tx-accent)]"
          />
          <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--tx-ink-muted)]">
            {Math.round(volumenVoces * 100)}%
          </span>
        </div>
      )}

      {aviso && !chromeMinimo && (
        <p
          role="status"
          className="mx-3 mb-3 shrink-0 rounded-lg px-2.5 py-2 text-[12px]"
          style={{ background: 'oklch(100% 0 0 / 6%)', color: 'var(--tx-ink-primary)' }}
        >
          {aviso}
        </p>
      )}

      {buscador && !encogido && !chromeMinimo && <Buscador onElegir={(p) => void poner(p)} />}

      {/* La cola es lo primero que sobra cuando se necesita espacio: dice qué
          viene después, no qué está pasando. Los comandos del chat la siguen
          manejando con el panel encogido -- y ni en grande/compacto, que
          apuestan todo el alto al video. */}
      <div className={`px-3 pb-4 ${encogido || chromeMinimo ? 'hidden' : ''}`}>
        <p className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold text-[var(--tx-ink-primary)]">
          <ListMusicIcon className="size-3.5" aria-hidden />
          En cola ({sala.cola.length})
        </p>

        {sala.cola.length === 0 ? (
          <p className="text-[11px] text-[var(--tx-ink-muted)]">
            Nada más por ahora. Los comandos del chat (<code>/play</code>, <code>/skip</code>,{' '}
            <code>/queue</code>) funcionan igual que en un bot de música.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {sala.cola.map((p, i) => (
              <li key={`${p.video_id}-${i}`} className="flex gap-2 text-[12px]">
                <span className="w-4 shrink-0 tabular-nums text-[var(--tx-ink-muted)]">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--tx-ink-primary)]">{p.titulo}</span>
                  <span className="block truncate text-[11px] text-[var(--tx-ink-muted)]">
                    {p.canal} · {reloj(p.duracion_seg)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}

interface BotonMiniProps {
  onClick: () => void
  etiqueta: string
  activo?: boolean
  destacado?: boolean
  children: React.ReactNode
}

function BotonMini({ onClick, etiqueta, activo = false, destacado = false, children }: BotonMiniProps) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activo}
      className="inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{
        background: destacado ? 'var(--tx-accent)' : activo ? 'oklch(100% 0 0 / 12%)' : 'oklch(100% 0 0 / 4%)',
        color: destacado ? 'var(--tx-accent-fg)' : activo ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
        border: '1px solid var(--tx-border)',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Buscar algo para poner.
 *
 * Acepta texto y también un enlace pegado, y eso último no es una comodidad: una
 * URL se resuelve con 1 unidad de cuota y una búsqueda por texto con 100, de
 * 10.000 diarias para todo el equipo. Cuando la cuota se acaba, pegar el link es
 * el único camino que sigue funcionando — y el mensaje de error lo dice.
 */
function Buscador({ onElegir }: { onElegir: (pista: Pista) => void }) {
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<Pista[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buscar = async () => {
    const q = consulta.trim()
    if (!q || buscando) return

    setBuscando(true)
    setError(null)
    try {
      const res = await fetch(`/api/musica/buscar?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'No se pudo buscar')
      setResultados(json.data as Pista[])
      if ((json.data as Pista[]).length === 0) setError('Sin resultados')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error buscando')
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="px-3 pb-3 shrink-0">
      <div className="flex gap-2">
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void buscar()
            }
          }}
          placeholder="Buscar o pegar un enlace…"
          aria-label="Buscar música en YouTube"
          className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-[12px] outline-none"
          style={{ background: 'oklch(100% 0 0 / 6%)', color: 'var(--tx-ink-primary)' }}
        />
        <button
          onClick={() => void buscar()}
          disabled={!consulta.trim() || buscando}
          aria-label="Buscar"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
          style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
        >
          <SearchIcon className="size-4" />
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-[var(--tx-ink-muted)]">{error}</p>}

      {resultados.length > 0 && (
        <ul className="mt-2 space-y-1">
          {resultados.map((p) => (
            <li key={p.video_id}>
              <button
                onClick={() => {
                  onElegir(p)
                  setResultados([])
                  setConsulta('')
                }}
                className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-[oklch(100%_0_0_/_6%)]"
              >
                {/* Miniatura de YouTube: dimensiones explícitas para que la lista
                    no salte cuando cargan. */}
                {p.miniatura_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.miniatura_url}
                    alt=""
                    width={48}
                    height={36}
                    loading="lazy"
                    className="size-auto shrink-0 rounded object-cover"
                    style={{ width: 48, height: 36 }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-[var(--tx-ink-primary)]">{p.titulo}</span>
                  <span className="block truncate text-[11px] text-[var(--tx-ink-muted)]">
                    {p.canal} · {reloj(p.duracion_seg)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
