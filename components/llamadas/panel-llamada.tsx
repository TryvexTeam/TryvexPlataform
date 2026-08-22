'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIcon,
  HeadphoneOffIcon,
  HeadphonesIcon,
  Maximize2Icon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MonitorUpIcon,
  MonitorXIcon,
  PhoneOffIcon,
  SparklesIcon,
  Volume2Icon,
  VolumeXIcon,
  ShieldAlertIcon,
  VideoIcon,
  VideoOffIcon,
} from 'lucide-react'
import { MusicIcon } from 'lucide-react'
import { AvatarChat } from '@/components/chat/avatar-chat'
import { PipLlamada } from './pip-llamada'
import { ChatLlamada } from './chat-llamada'
import { ReproductorMusica, type TamanoMusica } from './reproductor-musica'
import { useGrillaVideo } from './use-grilla-video'
import { useHablando } from './use-hablando'
import { useMusica } from './use-musica'
import { useLlamada, type ParticipanteVivo } from './use-llamada'
import { extraerVideoId, leerComando, type ModoLoop, type Pista } from '@/lib/types/musica'

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
 * La pantalla compartida de alguien es una tarjeta propia en la grilla, no
 * parte de la suya -- así conviven con su cámara en vez de reemplazarla. El
 * id sintético las distingue de la tarjeta real de esa persona en todos
 * lados: destacar, hablar, volumen.
 */
const SUFIJO_PANTALLA = ':pantalla'
const idPantalla = (integranteId: string) => `${integranteId}${SUFIJO_PANTALLA}`
const esTarjetaPantalla = (id: string) => id.endsWith(SUFIJO_PANTALLA)

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
  const [musicaAbierta, setMusicaAbierta] = useState(false)
  /**
   * Atenuación general de las voces, de 0 a 1. Multiplica al volumen por persona
   * en vez de reemplazarlo: se puede bajar a todos para escuchar la música y
   * seguir subiendo al que no se le entiende.
   *
   * Existe porque la música no se puede subir por encima del 100%: sale del
   * iframe de YouTube, que es cross-origin y no admite un GainNode. Bajar el otro
   * lado es la única palanca real.
   */
  const [volumenVoces, setVolumenVoces] = useState(1)
  /**
   * Cuánto ocupa el panel de música: `encogido` deja el video y los controles,
   * `normal` suma cola y volúmenes, `grande` le da el área principal y manda a la
   * gente a la tira de arriba -- el mismo trato que a una pantalla compartida.
   *
   * Vive acá y no en el reproductor porque decide el hueco, y con eso cuánto le
   * queda a la grilla: los recuadros se reacomodan solos porque la grilla mide su
   * caja con un ResizeObserver.
   */
  const [musicaTamano, setMusicaTamano] = useState<TamanoMusica>('normal')
  // Callback ref por lo mismo que la grilla: minimizar y volver monta un ancla
  // nueva, y con un `useRef` el efecto que la mide no se enteraba.
  const [anclaMusica, setAnclaMusica] = useState<HTMLDivElement | null>(null)
  /** Dónde está el hueco reservado, en coordenadas de viewport. */
  const [huecoMusica, setHuecoMusica] = useState<DOMRect | null>(null)
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
  /** Panel de diagnóstico. Cerrado por defecto; se abre desde la cabecera. */
  const [verDiagnostico, setVerDiagnostico] = useState(false)
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
    diagnostico,
    ruidoSuprimido,
    cargandoSupresionRuido,
    alternarMicro,
    alternarCamara,
    alternarPantalla,
    alternarSupresionRuido,
    colgar,
  } = useLlamada({
    llamadaId,
    miIntegranteId,
    conVideo,
    onTerminada: onCerrar,
  })

  const porId = new Map(personas.map((p) => [p.id, p]))
  const yo = porId.get(miIntegranteId)


  /**
   * Quiénes están en la llamada ahora mismo. De acá sale quién es el encargado
   * de avanzar la cola cuando termina una pista: si avisaran los cinco, la cola
   * saltaría cinco canciones de golpe. Ver `mandaAvanzar`.
   */
  const presentes = useMemo(
    () => [miIntegranteId, ...participantes.map((p) => p.integranteId)].sort(),
    [miIntegranteId, participantes],
  )

  const musica = useMusica({ conversacionId, miIntegranteId, presentes })

  /**
   * Un comando escrito en el chat de la llamada.
   *
   * `/play <texto>` busca primero y encola el primer resultado; con un enlace
   * pegado, la búsqueda cuesta 1 unidad de cuota en vez de 100. El resto de los
   * comandos van directo a la API de música.
   */
  const ejecutarComandoChat = useCallback(
    async (linea: string): Promise<string> => {
      const leido = leerComando(linea)
      if (!leido) return 'Eso no es un comando'
      if (!leido.comando) return `No existe el comando /${leido.crudo}. Prueba /play, /skip, /queue o /loop.`

      if (leido.comando === 'play') {
        if (!leido.argumento) return 'Escribe qué quieres poner: /play seguido del nombre o el enlace'

        const res = await fetch(`/api/musica/buscar?q=${encodeURIComponent(leido.argumento)}`)
        const json = await res.json()
        if (!json.success) return json.error ?? 'No se pudo buscar'

        const [primera] = json.data as Pista[]
        if (!primera) {
          return extraerVideoId(leido.argumento)
            ? 'Ese video no se puede reproducir acá'
            : `Sin resultados para "${leido.argumento}"`
        }

        return (await musica.ejecutar('play', primera)) ?? 'No se pudo poner'
      }

      if (leido.comando === 'loop') {
        const modo = ['off', 'pista', 'cola'].includes(leido.argumento)
          ? (leido.argumento as ModoLoop)
          : undefined
        return (await musica.ejecutar('loop', modo)) ?? 'No se pudo cambiar la repetición'
      }

      return (await musica.ejecutar(leido.comando)) ?? 'No se pudo ejecutar'
    },
    [musica],
  )

  /**
   * Con algo sonando, el panel se muestra sí o sí.
   *
   * No es una comodidad: el reproductor de YouTube tiene que estar montado y a la
   * vista para que suene, y los términos de la API exigen un viewport de 200×200
   * px visible. Un panel cerrado con música puesta sería o silencio o una
   * infracción, y las dos son peores que ocupar una columna.
   *
   * Es estado derivado y no un efecto: sincronizarlo con `setState` dispararía un
   * render en cascada por cada cambio de pista.
   */
  const musicaVisible = musicaAbierta || Boolean(musica.sala.video_id)

  /**
   * Seguir al hueco reservado para el panel de música.
   *
   * El reproductor se monta UNA vez y fuera de la vista, por la misma razón que
   * la capa de audio: si viviera dentro, minimizar la llamada lo desmontaría y
   * la música se cortaría -- y al restaurar nacía un iframe nuevo, que es el
   * negro con el cargando de YouTube. Como no puede estar en el flujo, se le
   * calca la posición al ancla, que sí está y sí empuja a los recuadros.
   *
   * Se mide con ResizeObserver sobre el ancla y con uno sobre el contenedor
   * entero: el hueco también se mueve cuando se abre el chat al lado o cuando
   * cambia el tamaño de la ventana, y eso no cambia el tamaño del ancla.
   */
  useEffect(() => {
    if (!anclaMusica) return

    const medir = () => setHuecoMusica(anclaMusica.getBoundingClientRect())
    medir()

    const observador = new ResizeObserver(medir)
    observador.observe(anclaMusica)
    // También el padre: el hueco se corre cuando se abre el chat al lado, y eso
    // no cambia el tamaño del ancla, solo su posición.
    if (anclaMusica.parentElement) observador.observe(anclaMusica.parentElement)
    window.addEventListener('resize', medir)

    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [anclaMusica])

  // Minimizada no hay hueco que seguir: se descarta al derivar y no reseteando el
  // estado desde el efecto, que dejaría un render con la medida vieja.
  const huecoVigente = minimizado ? null : huecoMusica

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
      // Ya no muestra la pantalla acá -- eso es una tarjeta aparte, más
      // abajo. La cámara sigue mandando (si está prendida) aunque se esté
      // compartiendo pantalla al mismo tiempo.
      stream: streamLocal,
      nombre: yo?.nombre ? `${yo.nombre} (tú)` : 'Tú',
      avatarUrl: yo?.avatar_url ?? null,
      color: yo?.color ?? null,
      micro,
      camara,
      compartiendo: false,
      estado: 'conectado',
    },
    ...(streamPantalla
      ? [
          {
            id: idPantalla(miIntegranteId),
            stream: streamPantalla,
            nombre: yo?.nombre ? `Pantalla de ${yo.nombre}` : 'Tu pantalla',
            avatarUrl: yo?.avatar_url ?? null,
            color: yo?.color ?? null,
            micro: true,
            camara: false,
            compartiendo: true,
            estado: 'conectado' as const,
          },
        ]
      : []),
    ...participantes.flatMap((p) => {
      const persona = porId.get(p.integranteId)
      const propio = {
        id: p.integranteId,
        stream: p.stream,
        nombre: persona?.nombre ?? 'Alguien',
        avatarUrl: persona?.avatar_url ?? null,
        color: persona?.color ?? null,
        micro: p.micro,
        camara: p.camara,
        compartiendo: false,
        estado: p.estado,
      }
      if (!p.streamPantalla) return [propio]
      return [
        propio,
        {
          id: idPantalla(p.integranteId),
          stream: p.streamPantalla,
          nombre: `Pantalla de ${persona?.nombre ?? 'alguien'}`,
          avatarUrl: persona?.avatar_url ?? null,
          color: persona?.color ?? null,
          micro: true,
          camara: false,
          compartiendo: true,
          estado: p.estado,
        },
      ]
    }),
  ]

  const musicaGrande = musicaVisible && musicaTamano === 'grande' && !minimizado
  const enGrande = recuadros.find((r) => r.id === destacado) ?? null
  // Con el video en grande la gente va entera a la tira: nadie queda destacado,
  // porque el lugar de destacado ya lo ocupa el video.
  const enGrilla = musicaGrande ? recuadros : recuadros.filter((r) => r.id !== destacado)
  /** Si los recuadros van en tira horizontal en vez de repartidos en la caja. */
  const enTira = Boolean(enGrande) || musicaGrande

  // La caja real que le queda a los videos, ya descontado el chat si está
  // abierto. De acá sale el tamaño de cada recuadro.
  // Callback ref y no `useRef`: hace falta que el hook se entere cuando el nodo
  // cambia. Minimizar y restaurar la llamada monta uno nuevo, y con un ref el
  // observador se quedaba mirando el viejo. Ver `useGrillaVideo`.
  const [cajaGrilla, setCajaGrilla] = useState<HTMLDivElement | null>(null)
  const grilla = useGrillaVideo(cajaGrilla, enTira ? 0 : enGrilla.length)

  /**
   * Quién está hablando, incluido uno mismo.
   *
   * El propio recuadro estaba fuera de esta medición, y eso dejaba a la persona
   * sin ninguna forma de saber si su micrófono llega a la app. Cuando alguien
   * reporta "no se me escucha", lo primero que necesita es distinguir entre "mi
   * micrófono no entra" y "entra pero no sale hacia los demás" -- son dos fallas
   * distintas con arreglos distintos, y sin esta señal no se pueden separar.
   *
   * Se mide sobre `streamLocal`, que es la pista que efectivamente se está
   * enviando, no sobre el permiso del navegador. Que el sistema operativo vea el
   * micrófono no significa que esta pista traiga sonido.
   */
  const quienesHablan = useHablando(
    useMemo(
      () => [
        { id: miIntegranteId, stream: streamLocal },
        ...participantes.map((p) => ({ id: p.integranteId, stream: p.stream })),
      ],
      [participantes, streamLocal, miIntegranteId],
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
  const compartiendoAhora = participantes.find((p) => p.streamPantalla)?.integranteId ?? null
  // Ajuste de estado durante el render (no en un efecto): comparar contra el
  // valor anterior y llamar a setState de forma condicionada es el patrón que
  // React recomienda para esto, evita el render en cascada extra de hacerlo
  // en un efecto.
  const [previoCompartiendoAhora, setPrevioCompartiendoAhora] = useState(compartiendoAhora)
  if (compartiendoAhora !== previoCompartiendoAhora) {
    setPrevioCompartiendoAhora(compartiendoAhora)
    if (compartiendoAhora) setDestacado(idPantalla(compartiendoAhora))
  }

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
          // La atenuación general se aplica acá, sobre el audio, y NO en el
          // control de cada persona: si multiplicara el valor que alimenta ese
          // slider, mover el volumen de alguien guardaría el nivel ya atenuado
          // como si fuera el suyo, y al subir las voces quedaría al doble.
          volumen={(volumenes.get(p.integranteId) ?? 1) * volumenVoces}
        />
      ))}

      {/* El audio de la pantalla compartida (si el que comparte tildó
          "Compartir audio también") va en su propio elemento -- viajó en una
          pista de audio aparte, no mezclada con el micrófono, así que se
          reproduce aparte también. Sigue la misma atenuación/silencio que la
          voz de esa persona, pero sin control de volumen propio: es una sola
          perilla por participante, no una por cada cosa que suene. */}
      {participantes
        .filter((p) => p.streamAudioPantalla)
        .map((p) => (
          <AudioRemoto
            key={`${p.integranteId}-pantalla`}
            stream={p.streamAudioPantalla}
            mudo={ensordecido || silenciados.has(p.integranteId)}
            volumen={(volumenes.get(p.integranteId) ?? 1) * volumenVoces}
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
  // Minimizado: el recuadro con imagen y controles, en cualquier página. Sin
  // esto, atender una llamada significa no poder usar el CRM, que es justo lo
  // contrario de lo que se busca.
  //
  // Reemplaza a la píldora de "En llamada" que había antes: se sigue pudiendo
  // arrastrar y recuerda dónde se dejó, pero además deja ver a quién se está
  // oyendo y silenciar o colgar sin restaurar la llamada entera.
  } else if (minimizado) {
    vista = (
      <PipLlamada
        onRestaurar={() => setMinimizado(false)}
        participantes={participantes}
        personas={porId}
        quienesHablan={quienesHablan}
        miIntegranteId={miIntegranteId}
        micro={micro}
        camara={camara}
        ensordecido={ensordecido}
        streamLocal={streamLocal}
        onAlternarMicro={alternarMicro}
        onAlternarCamara={alternarCamara}
        onAlternarEnsordecer={alternarEnsordecer}
        onColgar={colgar}
      />
    )
  } else {
    vista = (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: 'oklch(8% 0.004 240 / 96%)', backdropFilter: 'blur(24px)' }}
      role="dialog"
      aria-label={`Llamada en ${titulo}`}
    >
      {/* `pt-safe`: el layout declara `viewportFit: 'cover'`, así que la llamada
          se dibuja BAJO la Dynamic Island y la barra de estado del iPhone. Sin
          compensar el inset, el botón de minimizar queda debajo de la hora y el
          wifi: se ve, y no se puede tocar. La barra del sistema gana siempre. */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 pt-safe">
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
          onClick={() => setVerDiagnostico((v) => !v)}
          aria-label="Ver el estado de la conexión y el micrófono"
          title="Estado de la conexión y el micrófono"
          className="rounded-lg px-2 py-1.5 text-[13px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
        >
          <ActivityIcon className="size-4" />
        </button>
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

      {/* Diagnóstico. Existe porque "no se me escucha" son tres fallas distintas
          -- el micrófono no entra, entra y no sale, o sale y el otro no lo
          reproduce -- y sin datos no se pueden separar. Adivinar cuál es cuesta
          más que mostrarlo. */}
      {verDiagnostico && diagnostico && (
        <div className="mx-4 mb-2 rounded-lg px-3 py-2 text-[12px]"
             style={{ background: 'oklch(100% 0 0 / 5%)', border: '1px solid var(--tx-border)' }}>
          <p className="text-[var(--tx-ink-primary)]">
            Micrófono:{' '}
            {!diagnostico.pistaLocal.existe ? (
              <b className="text-[oklch(75%_0.16_25)]">no hay pista — la app no tomó el micrófono</b>
            ) : diagnostico.pistaLocal.silenciadaPorSistema ? (
              <b className="text-[oklch(75%_0.16_25)]">silenciado por el sistema o tomado por otra app</b>
            ) : !diagnostico.pistaLocal.activa ? (
              <b className="text-[oklch(80%_0.13_75)]">silenciado desde acá</b>
            ) : (
              <b className="text-[oklch(75%_0.16_150)]">activo ({diagnostico.pistaLocal.estado})</b>
            )}
          </p>

          {diagnostico.porPersona.map((d) => {
            const nombre = porId.get(d.id)?.nombre ?? 'Alguien'
            return (
              <p key={d.id} className="text-[var(--tx-ink-muted)]">
                {nombre}: envío {d.paquetesEnviados} · recibo {d.paquetesRecibidos}
                {d.paquetesEnviados === 0 && (
                  <b className="ml-1 text-[oklch(75%_0.16_25)]">no le está saliendo audio</b>
                )}
                <br />
                <span className="opacity-80">
                  video: envío {d.videoEnviado} · recibo {d.videoRecibido} · ranura{' '}
                  {d.direccionVideo}
                  {/* Debe ser 1. Con dos, la pista puede irse por la que no está
                      atada a ninguna m-line: sale `envío 0` con la ranura en
                      sendrecv, y cada lado reporta una dirección distinta para la
                      misma conexión. */}
                  {d.ranurasVideo !== 1 && (
                    <b className="ml-1 text-[oklch(80%_0.13_75)]">
                      ({d.ranurasVideo} ranuras de video)
                    </b>
                  )}
                </span>
                {/* El video se mide aparte del audio porque falla aparte: son
                    m-lines distintas. "Recibo audio pero no video" y "no recibo
                    nada" son dos problemas con dos arreglos distintos. */}
                {d.videoRecibido === 0 && d.direccionVideo === 'sendonly' && (
                  <b className="ml-1 text-[oklch(75%_0.16_25)]">
                    esta conexión no puede recibir video
                  </b>
                )}
              </p>
            )
          })}

          <p className="mt-1 text-[11px] text-[var(--tx-ink-muted)]">
            Si «envío» no sube mientras habla, el problema está en la conexión con esa
            persona, no en su micrófono.
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 gap-3">
          {/* El video de YouTube agrandado. Ocupa el área principal y manda a la
              gente a la tira, igual que una pantalla compartida: si están viendo
              algo juntos, lo que importa es lo que se ve, no las caras. El
              reproductor no se dibuja acá -- esto es el hueco que le reserva. */}
          {musicaGrande && <div ref={setAnclaMusica} className="flex-1 min-h-0" aria-hidden />}

          {/* Vista destacada. Cuando hay alguien elegido ocupa casi todo y el
              resto baja a una tira: es lo que uno quiere cuando alguien comparte
              pantalla y hay que leer lo que muestra. */}
          {enGrande && !musicaGrande && (
            <div className="flex-1 min-h-0">
              <Recuadro
                {...enGrande}
                grande
                hablando={quienesHablan.has(enGrande.id)}
                volumen={
                  enGrande.id === miIntegranteId || esTarjetaPantalla(enGrande.id)
                    ? null
                    : (volumenes.get(enGrande.id) ?? 1)
                }
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
            ref={setCajaGrilla}
            className={
              enTira
                ? 'shrink-0 flex gap-2 overflow-x-auto pb-1'
                : 'flex-1 min-h-0 flex flex-wrap items-center justify-center content-center gap-3 overflow-hidden'
            }
          >
            {enGrilla.map((r) => (
              <div
                key={r.id}
                className={enTira ? 'w-40 shrink-0' : 'shrink-0'}
                style={
                  enTira
                    ? undefined
                    : { width: grilla.ancho || undefined, height: grilla.alto || undefined }
                }
              >
                <Recuadro
                  {...r}
                  hablando={quienesHablan.has(r.id)}
                  volumen={
                    r.id === miIntegranteId || esTarjetaPantalla(r.id) ? null : (volumenes.get(r.id) ?? 1)
                  }
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
            onComando={ejecutarComandoChat}
          />
        )}

        {/* El hueco del panel de música. El reproductor no se dibuja acá dentro:
            se monta una sola vez fuera de esta vista y se posiciona encima de
            este ancla. Lo que hace este div es reservar el ancho, que es lo que
            corre los recuadros de la gente. */}
        {/*
          En escritorio el hueco va en el flujo y empuja: la grilla se achica y
          los recuadros se reacomodan. En el teléfono no puede empujar -- apilado
          bajo el video dejaba a la gente en una franja de nada. Ahí es una hoja
          sobre la llamada, por encima del video y por debajo de la botonera, que
          es lo que hacen Meet y Discord con el chat en móvil.
        */}
        {musicaVisible && !musicaGrande && (
          <div
            ref={setAnclaMusica}
            className={`fixed inset-x-0 bottom-[84px] top-auto h-[58vh] md:static md:h-auto md:inset-auto md:shrink-0 w-full ${
              musicaTamano === 'encogido' ? 'md:w-[224px]' : 'md:w-[320px]'
            }`}
            aria-hidden
          />
        )}
      </div>

      {/* Lo mismo abajo: sin `pb-safe`, colgar y silenciar quedan sobre la barra
          de gestos, donde el deslizamiento del sistema se lleva el toque. */}
      <footer className="flex items-center justify-center gap-1.5 px-2 py-5 shrink-0 pb-safe md:gap-3 md:px-4">
        <Boton
          activo={micro}
          onClick={alternarMicro}
          etiqueta={micro ? 'Silenciar micrófono' : 'Activar micrófono'}
        >
          {micro ? <MicIcon className="size-5" /> : <MicOffIcon className="size-5" />}
        </Boton>

        {/* Supresión de ruido tipo Discord (RNNoise por WASM). Solo desktop:
            corre un modelo entero por cada llamada y en un teléfono no vale
            la pena el costo de CPU/batería -- mismo criterio que "compartir
            pantalla", que tampoco existe ahí. */}
        <Boton
          activo={ruidoSuprimido}
          onClick={() => void alternarSupresionRuido()}
          etiqueta={
            cargandoSupresionRuido
              ? 'Activando supresión de ruido…'
              : ruidoSuprimido
                ? 'Apagar supresión de ruido'
                : 'Suprimir ruido de fondo'
          }
          clase="hidden md:inline-flex"
        >
          {cargandoSupresionRuido ? (
            <ActivityIcon className="size-5 animate-pulse" />
          ) : ruidoSuprimido ? (
            <SparklesIcon className="size-5" />
          ) : (
            <SparklesIcon className="size-5 opacity-60" />
          )}
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

        {/* La música no se mezcla en el micrófono: cada navegador reproduce la
            misma pista en la misma posición. Ver la migración 039. */}
        <Boton
          activo={musicaVisible}
          onClick={() => setMusicaAbierta((v) => !v)}
          etiqueta={musicaVisible ? 'Cerrar la música' : 'Abrir la música'}
        >
          <MusicIcon className="size-5" />
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
          className="inline-flex size-12 md:size-14 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: 'oklch(55% 0.22 25)', color: 'white' }}
        >
          <PhoneOffIcon className="size-5 md:size-6" />
        </button>
      </footer>
    </div>
    )
  }

  // La capa de audio y el reproductor de música van SIEMPRE en el mismo lugar del
  // árbol, hermanos de la vista y nunca dentro de ella. Es lo que hace que
  // minimizar y restaurar no los desmonte: React solo reconcilia `vista`, y ellos
  // ni se enteran. Para la música eso es la diferencia entre seguir sonando y
  // cortarse cada vez que alguien vuelve al CRM un momento.
  return (
    <>
      {capaAudio}
      {vista}

      {musicaVisible && (
        <div
          className="fixed z-[81]"
          style={
            huecoVigente
              ? {
                  top: huecoVigente.top,
                  left: huecoVigente.left,
                  width: huecoVigente.width,
                  height: huecoVigente.height,
                }
              : // Con la llamada minimizada el hueco no existe, pero el reproductor
                // tiene que seguir a la vista: apagarlo cortaría la música, y
                // esconderlo rompe los términos de la API. Queda como miniatura
                // sobre la píldora de "En llamada".
                { bottom: 88, right: 12, width: 224, height: 300 }
          }
        >
          <ReproductorMusica
            musica={musica}
            // Cerrar con algo sonando es detener la música: si solo se ocultara,
            // el reproductor se desmontaría y el audio se cortaría igual, pero sin
            // que el resto del equipo se entere de por qué.
            onCerrar={() => {
              if (musica.sala.video_id) void musica.ejecutar('stop')
              setMusicaAbierta(false)
            }}
            volumenVoces={volumenVoces}
            onVolumenVoces={setVolumenVoces}
            // Con la llamada minimizada solo cabe la miniatura, sin cola ni
            // sliders: se fuerza encogido sin tocar la preferencia de la persona,
            // que vuelve tal cual estaba al restaurar.
            tamano={minimizado ? 'encogido' : musicaTamano}
            onTamano={setMusicaTamano}
          />
        </div>
      )}
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
      className={`inline-flex size-12 md:size-14 items-center justify-center rounded-full transition-transform active:scale-95 ${clase}`}
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

  /**
   * ¿Hay imagen que mostrar?
   *
   * Se mira la pista real y no solo las banderas: una pista puede existir en la
   * conexión y estar `muted` -- reservada, sin datos -- que es exactamente el
   * estado en el que llega antes de que el otro lado empiece a transmitir. Pintar
   * el `<video>` en ese momento da un rectángulo negro; mostrar el avatar es la
   * respuesta honesta.
   *
   * Las banderas siguen contando para el caso local: con la cámara apagada la
   * pista sigue viva (`enabled = false` no la silencia), así que sin ellas se
   * vería el último cuadro congelado.
   */
  const pistaVideo = stream?.getVideoTracks()[0]

  /**
   * Si la pista está entregando imagen ahora mismo.
   *
   * Esto NO se puede leer solo al renderizar, y ahí estaba el bug: `muted` y
   * `readyState` son propiedades vivas del track que cambian solas, por fuera de
   * React, sin avisarle a nadie. Una pista remota nace `muted` -- reservada, sin
   * datos -- y se destapa cuando el otro lado empieza a mandar. Si ese momento
   * caía entre dos renders, el recuadro se quedaba con `muted = true` para
   * siempre: la imagen llegaba y la app mostraba el avatar, sin nada que la
   * hiciera mirar de nuevo.
   *
   * Por eso "lo ve uno y el otro no" y por qué cambiaba entre navegadores: es una
   * carrera, y cada uno la perdía en un momento distinto.
   *
   * Con los eventos enganchados acá, el recuadro se entera por su cuenta y deja
   * de depender de que la capa de señalización acierte el instante.
   */
  const [entregando, setEntregando] = useState(false)
  useEffect(() => {
    // Sin pista no se toca el estado: se descarta al derivar `hayVideo`, más
    // abajo. Resetearlo desde acá sería un render de más por cada cambio de
    // stream.
    if (!pistaVideo) return

    const revisar = () => setEntregando(pistaVideo.readyState === 'live' && !pistaVideo.muted)
    // La lectura inicial es obligatoria y no se puede derivar en el render: si la
    // pista ya venía destapada antes de montar, no habrá ningún evento después y
    // sin esto el recuadro se queda en el avatar para siempre. Es justo el bug
    // que este efecto arregla.
    revisar()

    pistaVideo.addEventListener('unmute', revisar)
    pistaVideo.addEventListener('mute', revisar)
    pistaVideo.addEventListener('ended', revisar)

    return () => {
      pistaVideo.removeEventListener('unmute', revisar)
      pistaVideo.removeEventListener('mute', revisar)
      pistaVideo.removeEventListener('ended', revisar)
    }
  }, [pistaVideo])

  /**
   * Las banderas siguen contando para el caso local: con la cámara apagada la
   * pista sigue viva (`enabled = false` no la silencia), así que sin ellas se
   * vería el último cuadro congelado.
   *
   * Se mantienen tal cual: un remoto que apaga la cámara con `enabled = false`
   * sigue mandando una pista viva y sin `muted` -- cuadros negros. Sin las
   * banderas se vería ese negro en vez del avatar, que es peor.
   */
  const hayVideo = Boolean(pistaVideo) && entregando && (camara || compartiendo)

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

        {/* Pantalla completa nativa del navegador, como en YouTube. Solo tiene
            sentido en el recuadro destacado -- en la grilla el video ya es
            chico a propósito. */}
        {grande && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              videoRef.current?.requestFullscreen().catch(() => {
                /* el navegador negó el pedido (ej. falta de gesto de usuario
                   registrado); no hay nada que hacer salvo no romper el resto. */
              })
            }}
            aria-label="Pantalla completa"
            title="Pantalla completa"
            className="shrink-0 p-1 text-white/70 hover:text-white"
          >
            <Maximize2Icon className="size-3.5" />
          </button>
        )}

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
