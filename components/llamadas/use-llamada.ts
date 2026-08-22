'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import {
  BITRATE_PANTALLA,
  EVENTO_SENAL,
  canalLlamada,
  debeOfrecer,
  perfilVideo,
  type SenalLlamada,
} from '@/lib/types/llamada'

/**
 * El motor de la llamada: una malla WebRTC entre todos los que están dentro.
 *
 * Cada participante abre una conexión directa con cada otro. Con 5 personas son
 * 10 conexiones y ningún servidor en el medio — de ahí que la llamada no tenga
 * límite de minutos: no hay nada que consumir. El precio es que cada uno sube su
 * video N-1 veces, y por eso `perfilVideo` baja la resolución cuando entra gente.
 *
 * Supabase Realtime hace de central telefónica: transporta ofertas, respuestas y
 * candidatos ICE. Nada de eso toca la base de datos; vence en segundos.
 */

export type EstadoConexion = 'conectando' | 'conectado' | 'reconectando' | 'fallido'

export interface ParticipanteVivo {
  integranteId: string
  stream: MediaStream | null
  estado: EstadoConexion
  micro: boolean
  camara: boolean
  compartiendo: boolean
  /**
   * El audio de SU pantalla compartida, si trae uno. Separado del micrófono
   * a propósito: `AudioContext.createMediaStreamSource` solo toma la primera
   * pista de audio de un stream, así que si viajaran juntas en el mismo
   * MediaStream, el audio de pantalla nunca sonaría -- necesita su propio
   * elemento `<audio>`.
   *
   * (Se probó unmutear el `<video>` de la tarjeta y mandarle video+audio
   * juntos para que el control de volumen del navegador en pantalla
   * completa funcionara -- ver PR #161. Rebotó en producción: un `<video>`
   * sin mutear con `autoPlay` cae bajo la política de autoplay del
   * navegador y necesita un gesto del usuario para sonar, así que del otro
   * lado simplemente no se escuchaba nada; y a quien comparte, si el
   * navegador sí lo dejaba sonar, se le duplicaba su propio audio de
   * pantalla -- una vez real, sonando en su equipo, y otra vez rebotada por
   * este `<video>`. De vuelta al camino separado, que sí funciona.)
   */
  streamAudioPantalla: MediaStream | null
  /**
   * El VIDEO de su pantalla compartida, si está compartiendo. Viaja en una
   * pista de video aparte de la cámara: no se reemplazan entre sí, y la
   * pantalla se renderiza como una tarjeta propia, no en el mismo recuadro.
   */
  streamPantalla: MediaStream | null
}

interface UseLlamadaOpts {
  llamadaId: string | null
  miIntegranteId: string
  conVideo: boolean
  /** La llamada se cerró del otro lado o por la API. */
  onTerminada?: () => void
}

interface Par {
  pc: RTCPeerConnection
  /**
   * Las pistas que llegaron de esa persona, una por tipo.
   *
   * El stream remoto se arma acá y NO se toma de `ev.streams[0]`, que es lo que
   * hacía antes y es la causa de que la pantalla compartida se viera negra:
   * `replaceTrack` no asocia la pista a ningún MediaStream. La ranura de video se
   * reserva con `addTransceiver`, que tampoco la ata a uno. Resultado: la pista
   * de video llegaba al otro navegador sin stream, `ev.streams[0]` venía vacío y
   * no quedaba nada que pintar.
   */
  pistas: Map<string, MediaStreamTrack>
  /** Candidatos que llegaron antes que la descripción remota. Sin esta cola se
   *  pierden y la conexión queda a medio armar en redes lentas. */
  pendientes: RTCIceCandidateInit[]
  /** Evita aplicar dos ofertas cruzadas ("glare") sobre la misma conexión. */
  negociando: boolean
  /**
   * Cuántas veces se intentó enderezar la ranura de video en esta conexión.
   *
   * La autorreparación corre cada dos segundos. Si la renegociación no arregla la
   * dirección --porque la causa está del otro lado, o en una versión vieja que
   * todavía no recargó-- sin tope quedaría ofreciendo para siempre: una oferta
   * cada dos segundos por cada persona, que en una malla es ruido serio y puede
   * dejar la conexión peor que el problema que intenta arreglar.
   */
  intentosRanura: number
  /**
   * El sender del audio de la pantalla compartida en esta conexión, si hay
   * uno. A diferencia del video, el audio de pantalla no tiene una ranura
   * reservada de antemano -- es opcional (el usuario puede no tocar "Compartir
   * audio también" en el selector del navegador) y su ausencia no debe
   * tumbar nada. Se guarda acá para poder sacarlo con `removeTrack` cuando
   * termina de compartir.
   */
  senderAudioPantalla: RTCRtpSender | null
  /**
   * El sender del VIDEO de la pantalla compartida. Igual que el de audio: no
   * hay una ranura reservada de antemano para esto -- es la pista extra que
   * antes reemplazaba a la cámara en la ranura de video, y ahora viaja
   * aparte para que las dos convivan.
   */
  senderVideoPantalla: RTCRtpSender | null
}

/** Cuántas veces se reintenta enderezar la ranura antes de rendirse. */
const MAX_INTENTOS_RANURA = 4

/**
 * La ranura de video de una conexión.
 *
 * Se busca por el transceiver y no por `sender.track?.kind`: cuando la ranura
 * está vacía —llamada que empezó en audio— el sender no tiene pista y no hay
 * `kind` que mirar. El receiver sí declara 'video' desde que se crea.
 */
/**
 * `excluirSender` saca de la cuenta al sender del video de pantalla
 * compartida (`Par.senderVideoPantalla`), si hay uno. Antes solo existía UN
 * transceiver de video por conexión; ahora, con la pantalla como pista
 * independiente de la cámara, puede haber dos al mismo tiempo -- sin
 * excluirlo, esta función (y todo lo que se apoya en ella: `ranuraDeVideo`,
 * `abrirRanuraDeVideo`, `repartirVideo`, la autorreparación) confundiría uno
 * con otro y podía terminar vaciando la pantalla compartida cada vez que se
 * tocaba la cámara.
 */
function transceiversDeVideo(
  pc: RTCPeerConnection,
  excluirSender?: RTCRtpSender | null,
): RTCRtpTransceiver[] {
  return pc.getTransceivers().filter(
    (t) =>
      // `stopped` como propiedad ya no existe: un transceiver detenido se
      // reconoce por su dirección actual.
      t.currentDirection !== 'stopped' &&
      (t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video') &&
      t.sender !== excluirSender,
  )
}

/**
 * LA ranura de video de CÁMARA: la que está realmente negociada, sin contar
 * la de pantalla (ver `excluirSender` arriba).
 *
 * Una conexión puede terminar con más de un transceiver de video -- los crea
 * `addTrack` por un lado y `addTransceiver` por el otro, y una renegociación
 * puede sumar otro. Solo uno queda atado a una m-line del SDP, y ése es el único
 * por el que viaja algo. `mid` es lo que lo distingue: nulo mientras no está
 * asociado a ninguna m-line.
 *
 * Elegir el primero que apareciera --lo que se hacía antes-- salía bien o mal
 * según el orden, y de ahí venía el sintoma imposible: los dos lados de la MISMA
 * conexión reportaban direcciones distintas (`sendonly` en uno, `sendrecv` en el
 * otro) porque cada uno estaba mirando un transceiver diferente. Y quien
 * compartía ponía su pantalla en el sender equivocado: `envío 0` con la ranura
 * en `sendrecv` y nadie viéndolo.
 */
function ranuraDeVideo(pc: RTCPeerConnection, excluirSender?: RTCRtpSender | null): RTCRtpTransceiver | null {
  const todas = transceiversDeVideo(pc, excluirSender)
  // Sin negociar todavía no hay `mid`; ahí el primero es el que se va a usar.
  return todas.find((t) => t.mid !== null) ?? todas[0] ?? null
}

/**
 * El sender del micrófono, distinto del de la pantalla compartida (esa se
 * guarda aparte en `Par.senderAudioPantalla` porque es opcional y se agrega
 * después). El del micrófono es el otro sender de audio: el que crea el
 * `addTrack` inicial de `crearPar`, siempre presente desde que se abre la
 * conexión.
 */
function senderDeMicrofono(pc: RTCPeerConnection, par: Par): RTCRtpSender | null {
  return (
    pc
      .getSenders()
      .find((s) => s.track && s.track.kind === 'audio' && s !== par.senderAudioPantalla) ?? null
  )
}

/**
 * Dejar la ranura de video en condiciones de enviar Y recibir.
 *
 * Este es el bug que dejaba a alguien sin ver las transmisiones de los demás
 * mientras los demás sí veían la suya. `replaceTrack` llena el sender pero NO
 * cambia la dirección negociada: si la conexión se pactó `sendonly` --porque al
 * negociar este lado tenía cámara y el otro no, o al revés-- entonces por ahí no
 * entra video jamás, por mucho que el otro transmita. En el diagnóstico se veía
 * exactamente así: `video: envío 0 · recibo 0 · ranura sendonly`.
 *
 * Cambiar `direction` obliga a renegociar para que tenga efecto; devuelve si hizo
 * falta, para que quien llama dispare la oferta.
 */
function abrirRanuraDeVideo(pc: RTCPeerConnection, excluirSender?: RTCRtpSender | null): boolean {
  const tr = ranuraDeVideo(pc, excluirSender)
  if (!tr) {
    pc.addTransceiver('video', { direction: 'sendrecv' })
    return true
  }
  if (tr.direction !== 'sendrecv') {
    tr.direction = 'sendrecv'
    return true
  }
  // `currentDirection` es lo REALMENTE pactado; `direction` es lo que uno pide.
  // Que pidan sendrecv y lo pactado sea otra cosa significa que la última
  // negociación quedó torcida y hay que rehacerla.
  return tr.currentDirection !== null && tr.currentDirection !== 'sendrecv'
}

/**
 * Como esta conectada esta llamada.
 *
 * 'directa' = el media va navegador a navegador y no cuesta nada.
 * 'relay'   = pasa por TURN y consume de la cuota de Cloudflare.
 * null      = todavia no se sabe (la conexion aun no se establecio).
 */
export type TipoConexion = 'directa' | 'relay' | null

/**
 * Pregunta a WebRTC por que camino quedo la conexion.
 *
 * Se mira el par de candidatos ACTIVO (`nominated` + `state === 'succeeded'`),
 * no la lista de candidatos ofrecidos: se ofrecen varios y se usa uno solo. Si
 * cualquiera de las dos puntas es de tipo 'relay', el trafico pasa por TURN.
 */
async function comoConecto(pc: RTCPeerConnection): Promise<TipoConexion> {
  try {
    const stats = await pc.getStats()
    let activo: RTCIceCandidatePairStats | null = null
    const candidatos = new Map<string, { candidateType?: string }>()

    stats.forEach((r) => {
      if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
        candidatos.set(r.id, r as { candidateType?: string })
      }
      const par = r as RTCIceCandidatePairStats & { nominated?: boolean }
      if (r.type === 'candidate-pair' && par.state === 'succeeded' && par.nominated) {
        activo = par
      }
    })

    if (!activo) return null
    const par = activo as RTCIceCandidatePairStats
    const local = candidatos.get(par.localCandidateId ?? '')
    const remoto = candidatos.get(par.remoteCandidateId ?? '')

    return local?.candidateType === 'relay' || remoto?.candidateType === 'relay' ? 'relay' : 'directa'
  } catch {
    return null
  }
}

/**
 * Lo que hace falta para diagnosticar "no se me escucha" sin adivinar.
 *
 * Son tres preguntas distintas y cada una tiene un arreglo distinto:
 *   1. ¿la pista de micrófono existe y está viva?  -> `pistaLocal`
 *   2. ¿se está enviando audio hacia cada persona? -> `paquetesEnviados`
 *   3. ¿llega audio desde cada persona?            -> `paquetesRecibidos`
 *
 * Si (1) está bien y (2) no crece, el problema está en la conexión, no en el
 * micrófono. Si (1) está mal, no hay nada que buscar del lado de la red.
 */
export interface DiagnosticoLlamada {
  pistaLocal: { existe: boolean; activa: boolean; silenciadaPorSistema: boolean; estado: string }
  porPersona: {
    id: string
    paquetesEnviados: number
    paquetesRecibidos: number
    /**
     * Lo mismo para el video, que se medía por separado justamente porque el
     * audio puede ir perfecto mientras el video no llega: son m-lines distintas
     * y fallan por causas distintas.
     *
     * Sin este número, "no veo su pantalla" tiene dos explicaciones opuestas
     * -- llega y no se pinta, o no llega -- y no había forma de elegir entre
     * ellas salvo probar a ciegas con tres personas conectadas.
     */
    videoEnviado: number
    videoRecibido: number
    /** La dirección negociada de la ranura de video: 'sendrecv', 'recvonly'… */
    direccionVideo: string
    /**
     * Cuántos transceivers de video tiene la conexión. Debe ser 1. Más de uno
     * significa que la negociación dejó m-lines de sobra, y entonces la pista
     * puede terminar en la que no está atada a ninguna: `envío 0` con la ranura
     * diciendo `sendrecv`, y los dos lados reportando direcciones distintas para
     * la misma conexión.
     */
    ranurasVideo: number
  }[]
}

export function useLlamada({ llamadaId, miIntegranteId, conVideo, onTerminada }: UseLlamadaOpts) {
  const [participantes, setParticipantes] = useState<ParticipanteVivo[]>([])
  /** Si alguna de las conexiones pasa por relay, la llamada cuenta como relay. */
  const [conexion, setConexion] = useState<TipoConexion>(null)
  /** Para reportar la duracion real al colgar. */
  const inicioRef = useRef<number>(0)
  const viaRelayRef = useRef(false)
  const [micro, setMicro] = useState(true)
  const [camara, setCamara] = useState(conVideo)
  const [compartiendo, setCompartiendo] = useState(false)
  const [streamLocal, setStreamLocal] = useState<MediaStream | null>(null)
  /**
   * Lo que uno está compartiendo, para verlo en su propio recuadro.
   *
   * Sin esto, quien comparte es el único que no ve lo que comparte: su recuadro
   * seguía mostrando la cámara. Y no saber si está proyectando la ventana
   * correcta —o si sigue proyectando— es justo lo que hace que alguien muestre
   * sin querer lo que no quería.
   */
  const [streamPantalla, setStreamPantalla] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Falso cuando no hay TURN configurado: hay redes donde no va a conectar. */
  const [hayTurn, setHayTurn] = useState(true)
  const [diagnostico, setDiagnostico] = useState<DiagnosticoLlamada | null>(null)
  /**
   * Supresión de ruido tipo Discord (RNNoise, red neuronal liviana vía WASM),
   * no el `noiseSuppression` básico del navegador que ya pide `arrancar` --
   * ese ayuda con eco y ruido estacionario, pero no con teclado, ventilador o
   * calle. Empieza apagada: correr un modelo por WASM tiene un costo de CPU
   * real y no todos los equipos del canal lo necesitan.
   */
  const [ruidoSuprimido, setRuidoSuprimido] = useState(false)
  const [cargandoSupresionRuido, setCargandoSupresionRuido] = useState(false)

  const pares = useRef(new Map<string, Par>())
  const canal = useRef<RealtimeChannel | null>(null)
  const local = useRef<MediaStream | null>(null)
  const pantalla = useRef<MediaStream | null>(null)
  const iceServers = useRef<RTCIceServer[]>([])
  /** La pista del micrófono tal como la entrega el navegador, sin procesar.
   *  Se guarda aparte porque, con la supresión activa, `local.current` lleva
   *  la pista PROCESADA -- sin esta referencia no habría forma de volver a
   *  la cruda, ni de pararla al colgar (parar la procesada no apaga el
   *  micrófono físico, solo el nodo de salida del grafo de audio). */
  const pistaMicCrudaRef = useRef<MediaStreamTrack | null>(null)
  const ctxRuidoRef = useRef<AudioContext | null>(null)
  const nodoRuidoRef = useRef<RnnoiseWorkletNode | null>(null)
  const fuenteRuidoRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const destinoRuidoRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  // Se leen dentro de callbacks que no se recrean; un ref evita reconectar la
  // malla entera cada vez que alguien silencia el micrófono.
  const microRef = useRef(micro)
  const camaraRef = useRef(camara)

  // En un efecto y no en el cuerpo del render: escribir un ref mientras se
  // renderiza rompe el render concurrente de React 19.
  useEffect(() => {
    microRef.current = micro
    camaraRef.current = camara
  }, [micro, camara])

  const actualizar = useCallback((id: string, cambio: Partial<ParticipanteVivo>) => {
    setParticipantes((previos) => {
      const i = previos.findIndex((p) => p.integranteId === id)
      if (i === -1) {
        return [
          ...previos,
          {
            integranteId: id,
            stream: null,
            estado: 'conectando',
            micro: true,
            camara: false,
            compartiendo: false,
            streamAudioPantalla: null,
            streamPantalla: null,
            ...cambio,
          },
        ]
      }
      const copia = [...previos]
      copia[i] = { ...copia[i], ...cambio }
      return copia
    })
  }, [])

  const enviar = useCallback((senal: SenalLlamada) => {
    canal.current?.send({ type: 'broadcast', event: EVENTO_SENAL, payload: senal })
  }, [])

  /** Ajusta lo que sube cada conexión a cuánta gente hay. */
  const aplicarCalidad = useCallback(() => {
    const cuantos = pares.current.size + 1
    const perfil = perfilVideo(cuantos)

    for (const par of pares.current.values()) {
      for (const sender of par.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        // Cámara y pantalla son pistas separadas ahora, cada una con su
        // propio sender -- antes, cuando compartir reemplazaba a la cámara
        // en la misma ranura, "hay pantalla" alcanzaba para saber a cuál de
        // las dos calidades aplicar. Ahora hay que distinguir CUÁL sender es
        // el de pantalla, o compartir le bajaría la calidad a la cámara
        // también.
        const esPantalla = sender === par.senderVideoPantalla
        const params = sender.getParameters()
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
        params.encodings[0].maxBitrate = esPantalla ? BITRATE_PANTALLA : perfil.maxBitrate
        params.encodings[0].maxFramerate = esPantalla ? 15 : perfil.fps
        // Falla en navegadores viejos y no es motivo para cortar la llamada: sin
        // esto la calidad no se adapta, pero se sigue oyendo y viendo.
        sender.setParameters(params).catch(() => {})
      }
    }
  }, [])

  const cerrarPar = useCallback((id: string) => {
    const par = pares.current.get(id)
    if (!par) return
    par.pc.onicecandidate = null
    par.pc.ontrack = null
    par.pc.onconnectionstatechange = null
    par.pc.close()
    pares.current.delete(id)
    setParticipantes((previos) => previos.filter((p) => p.integranteId !== id))
  }, [])

  const crearPar = useCallback(
    (otroId: string): Par => {
      const existente = pares.current.get(otroId)
      if (existente) return existente

      const pc = new RTCPeerConnection({
        iceServers: iceServers.current,
        // Junta todo el audio y el video en un solo par de puertos. Sin esto se
        // negocia una ruta por pista y en redes con NAT estricto tarda el doble.
        bundlePolicy: 'max-bundle',
      })

      const par: Par = {
        pc,
        pistas: new Map(),
        pendientes: [],
        negociando: false,
        intentosRanura: 0,
        senderAudioPantalla: null,
        senderVideoPantalla: null,
      }
      pares.current.set(otroId, par)

      for (const track of local.current?.getTracks() ?? []) {
        pc.addTrack(track, local.current!)
      }

      // La ranura de video se reserva SIEMPRE, aunque la llamada haya empezado
      // en audio y no haya cámara que poner.
      //
      // El porqué: agregar una pista después con `addTrack` obliga a renegociar
      // toda la conexión, y si esa renegociación no ocurre el otro lado nunca
      // recibe nada -- ve un recuadro negro mientras quien comparte ve su propia
      // pantalla perfectamente, porque la está leyendo en local. Con la ranura ya
      // creada, prender la cámara o compartir pantalla es solo llenarla con
      // `replaceTrack`, que no renegocia nada y se aplica al instante.
      // La ranura se abre SIEMPRE en sendrecv, tenga o no cámara este lado. Antes
      // solo se creaba cuando no había video local, y se daba por hecho que la
      // que creaba `addTrack` quedaba bidireccional -- no siempre: si el otro
      // lado responde sin intención de mandar, lo pactado termina en `sendonly` y
      // por esa conexión no entra video nunca más.
      abrirRanuraDeVideo(pc)

      /**
       * Si ya se está compartiendo pantalla, la conexión nueva tiene que nacer
       * con ella puesta.
       *
       * La pantalla NO vive en `local.current` -- vive en `pantalla.current`. Va
       * como pista de video APARTE de la ranura de cámara (que arriba se abrió
       * vacía o con lo que haya en `local.current`) -- antes esto hacía
       * `replaceTrack` sobre la ranura de cámara, y por eso compartir apagaba
       * la cara de quien compartía para el resto. Entra gratis en la primera
       * oferta/respuesta de esta conexión nueva, sin renegociar aparte.
       *
       * Pasa con quien entra tarde a la llamada, y también en cada reconexión:
       * `presence sync` cierra el par caído y crea uno nuevo.
       */
      const pistaVideoPantalla = pantalla.current?.getVideoTracks()[0]
      if (pistaVideoPantalla) {
        par.senderVideoPantalla = pc.addTrack(pistaVideoPantalla, pantalla.current!)
      }

      // El audio de la pantalla (si el usuario lo compartió) va como pista
      // aparte también, no reemplaza al micrófono.
      const pistaAudioPantalla = pantalla.current?.getAudioTracks()[0]
      if (pistaAudioPantalla) {
        par.senderAudioPantalla = pc.addTrack(pistaAudioPantalla, pantalla.current!)
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          enviar({ tipo: 'ice', de: miIntegranteId, para: otroId, candidato: ev.candidate.toJSON() })
        }
      }

      pc.ontrack = (ev) => {
        const p = pares.current.get(otroId)
        if (!p) return

        // Una por tipo: si llega una pista de video nueva reemplaza a la vieja,
        // no se acumulan. El audio Y el video de pantalla son la excepción: son
        // pistas SEGUNDAS que conviven con las del micrófono/cámara, así que
        // necesitan su propia clave -- si compartieran 'audio'/'video', se
        // pisarían según el orden en que lleguen los eventos. La ranura de
        // cámara siempre llega primero (se reserva desde `crearPar`), así que
        // la segunda pista de cada tipo es siempre la de pantalla.
        const esSegunda = (tipo: 'audio' | 'video') =>
          ev.track.kind === tipo && p.pistas.has(tipo) && p.pistas.get(tipo)!.id !== ev.track.id
        const clave = esSegunda('audio') ? 'audioPantalla' : esSegunda('video') ? 'videoPantalla' : ev.track.kind
        p.pistas.set(clave, ev.track)

        // Un MediaStream NUEVO en cada cambio, a propósito: mutar el existente no
        // le avisa a React ni al elemento <video>/<audio>, que ya tiene ese
        // objeto en `srcObject` y no vuelve a mirarlo.
        const rehacer = () => {
          const vivo = pares.current.get(otroId)
          if (!vivo) return
          const audioPantalla = vivo.pistas.get('audioPantalla')
          const videoPantalla = vivo.pistas.get('videoPantalla')
          actualizar(otroId, {
            // Sin las pistas de pantalla: la cámara/mic van en su propia
            // tarjeta, la pantalla en la suya. Separadas entre sí también:
            // `createMediaStreamSource` (el mic pasa por ahí) solo toma la
            // primera pista de audio de un stream, así que mezclarlas dejaría
            // muda a una de las dos.
            stream: new MediaStream(
              [...vivo.pistas.entries()]
                .filter(([k]) => k !== 'audioPantalla' && k !== 'videoPantalla')
                .map(([, t]) => t),
            ),
            streamAudioPantalla: audioPantalla ? new MediaStream([audioPantalla]) : null,
            streamPantalla: videoPantalla ? new MediaStream([videoPantalla]) : null,
          })
        }

        rehacer()

        /**
         * La pista existe desde que se negocia la conexión, pero llega en estado
         * `muted` -- reservada y sin datos. Los cuadros recién empiezan cuando el
         * otro lado la llena con `replaceTrack`, y eso dispara `unmute`.
         *
         * Sin este handler el recuadro se queda con la pista vacía que se creó al
         * conectar y nunca se entera de que empezó a llegar imagen: negro para
         * siempre aunque el video esté fluyendo.
         */
        ev.track.onunmute = rehacer
        ev.track.onended = () => {
          const vivo = pares.current.get(otroId)
          if (!vivo) return
          // Por la clave con la que se guardó, no por `kind`: borrar por
          // 'audio' cuando termina el audio de pantalla se llevaría puesto al
          // micrófono, que quedó guardado con esa misma clave.
          vivo.pistas.delete(clave)
          rehacer()
        }

        // Solo para las pistas de PANTALLA: cuando quien comparte deja de
        // hacerlo, `repartirVideoPantalla`/`repartirAudioPantalla` sacan el
        // sender con `removeTrack` y renegocian -- del lado de acá eso no
        // dispara `ended`, dispara `mute` (la pista sigue "existiendo" en el
        // transceiver, solo que sin datos). Sin este handler la tarjeta de
        // pantalla se quedaba pegada con el último cuadro congelado, como si
        // esa persona siguiera compartiendo para siempre. La cámara/mic NO
        // entran acá a propósito: para esas dos, "muted" es un estado normal
        // (cámara apagada, silenciado) que ya maneja el propio recuadro
        // mostrando el avatar -- ahí sí tiene que seguir existiendo la
        // tarjeta.
        if (clave === 'videoPantalla' || clave === 'audioPantalla') {
          ev.track.onmute = () => {
            const vivo = pares.current.get(otroId)
            if (!vivo) return
            vivo.pistas.delete(clave)
            rehacer()
          }
        }
      }

      pc.onconnectionstatechange = () => {
        const estado: EstadoConexion =
          pc.connectionState === 'connected'
            ? 'conectado'
            : pc.connectionState === 'failed'
              ? 'fallido'
              : pc.connectionState === 'disconnected'
                ? 'reconectando'
                : 'conectando'

        actualizar(otroId, { estado })

        // Al conectar se pregunta por que camino quedo. Es lo que alimenta el
        // indicador de "directa o por relay" y lo que se reporta al colgar: si
        // fue directa no consumio nada, si fue relay salio de la cuota.
        if (pc.connectionState === 'connected') {
          void comoConecto(pc).then((tipo) => {
            if (!tipo) return
            if (tipo === 'relay') viaRelayRef.current = true
            // Basta con que UNA conexion sea por relay para que la llamada
            // cuente como tal: esa es la que esta consumiendo.
            setConexion((previa) => (previa === 'relay' ? previa : tipo))
          })
        }

        // 'failed' es definitivo: hay que rehacer la ruta, no esperar. Se reintenta
        // una vez con ICE restart; si tampoco, se muestra fallido y el resto de la
        // llamada sigue viva -- que uno no conecte no puede tumbar a los demás.
        if (pc.connectionState === 'failed') {
          pc.restartIce()
        }
      }

      aplicarCalidad()
      return par
    },
    [actualizar, aplicarCalidad, enviar, miIntegranteId],
  )

  const ofrecer = useCallback(
    async (otroId: string) => {
      const par = crearPar(otroId)
      if (par.negociando) return
      par.negociando = true

      try {
        const oferta = await par.pc.createOffer()
        await par.pc.setLocalDescription(oferta)
        enviar({ tipo: 'oferta', de: miIntegranteId, para: otroId, sdp: oferta })
      } catch (err) {
        console.error('[llamada] ofrecer', err)
      } finally {
        par.negociando = false
      }
    },
    [crearPar, enviar, miIntegranteId],
  )

  /**
   * Mandar una pista de video (cámara o pantalla) a todas las conexiones.
   *
   * Antes esto era un `replaceTrack` suelto en tres lugares, apoyado en que la
   * ranura ya estaría lista. No siempre lo estaba: si la dirección pactada era
   * `sendonly`, llenar el sender no servía de nada -- el video salía y por esa
   * conexión no entraba nada, que es justo el caso de "todos me ven y yo no veo a
   * nadie".
   *
   * Ahora se abre la ranura en `sendrecv` y, si eso cambió algo, se renegocia:
   * cambiar la dirección solo tiene efecto tras una oferta nueva.
   */
  const repartirVideo = useCallback(
    async (pista: MediaStreamTrack | null) => {
      for (const [otroId, { pc }] of pares.current) {
        const par = pares.current.get(otroId)
        if (!par) continue

        // Excluyendo el sender de pantalla en las tres llamadas: sin esto,
        // tocar la cámara mientras se comparte pantalla confundía una ranura
        // con la otra y podía terminar vaciando la pantalla compartida.
        const hayQueRenegociar = abrirRanuraDeVideo(pc, par.senderVideoPantalla)
        const ranura = ranuraDeVideo(pc, par.senderVideoPantalla)

        // La pista va en la ranura de CÁMARA negociada y en ninguna otra. Si
        // hay más de un transceiver de video, dejar la pista colgada en el
        // que no está atado a una m-line es exactamente lo que producía
        // `envío 0` mientras la ranura decía `sendrecv`: el video salía hacia
        // un tubo que no existe.
        for (const t of transceiversDeVideo(pc, par.senderVideoPantalla)) {
          const destino = t === ranura ? pista : null
          if (t.sender.track === destino) continue
          await t.sender.replaceTrack(destino).catch(() => {})
        }

        // Solo desde un estado estable: ofrecer sobre una negociación a medio
        // camino la rompe, y el `presence sync` ya reintentará.
        if (hayQueRenegociar && pc.signalingState === 'stable') {
          void ofrecer(otroId)
        }
      }
    },
    [ofrecer],
  )

  /**
   * Agregar o sacar el audio de la pantalla compartida en las conexiones que
   * ya existían cuando se empieza o termina de compartir.
   *
   * A diferencia del video, esto SÍ necesita `addTrack`/`removeTrack` y una
   * renegociación real -- no hay una ranura de audio reservada de antemano,
   * porque el audio de pantalla es opcional (depende de si el usuario tocó
   * "Compartir audio también" en el selector del navegador) y no vale la pena
   * reservarla para algo que la mayoría de las veces no está. Si la
   * renegociación falla, el peor caso es que ese audio no se escuche -- el
   * micrófono y el video siguen andando igual, no es una falla que se
   * propague.
   */
  const repartirAudioPantalla = useCallback(
    async (pista: MediaStreamTrack | null, stream: MediaStream | null) => {
      for (const [otroId, { pc }] of pares.current) {
        const par = pares.current.get(otroId)
        if (!par) continue

        if (pista && stream && !par.senderAudioPantalla) {
          par.senderAudioPantalla = pc.addTrack(pista, stream)
        } else if (!pista && par.senderAudioPantalla) {
          try {
            pc.removeTrack(par.senderAudioPantalla)
          } catch {
            // La conexión ya pudo haberse cerrado; no hay nada que sacar.
          }
          par.senderAudioPantalla = null
        } else {
          continue
        }

        if (pc.signalingState === 'stable') void ofrecer(otroId)
      }
    },
    [ofrecer],
  )

  /**
   * Igual que `repartirAudioPantalla`, para el video de la pantalla
   * compartida. También necesita `addTrack`/`removeTrack` real: a diferencia
   * de la cámara, no hay una ranura reservada de antemano para esto -- antes
   * SÍ la reusaba (la de cámara), y por eso compartir apagaba la cara de
   * quien compartía. Ahora es una pista propia, independiente de la cámara.
   */
  const repartirVideoPantalla = useCallback(
    async (pista: MediaStreamTrack | null, stream: MediaStream | null) => {
      for (const [otroId, { pc }] of pares.current) {
        const par = pares.current.get(otroId)
        if (!par) continue

        if (pista && stream && !par.senderVideoPantalla) {
          par.senderVideoPantalla = pc.addTrack(pista, stream)
        } else if (!pista && par.senderVideoPantalla) {
          try {
            pc.removeTrack(par.senderVideoPantalla)
          } catch {
            // La conexión ya pudo haberse cerrado; no hay nada que sacar.
          }
          par.senderVideoPantalla = null
        } else {
          continue
        }

        if (pc.signalingState === 'stable') void ofrecer(otroId)
      }
    },
    [ofrecer],
  )

  /**
   * Alguien avisó que empezó a transmitir: asegurarse de poder recibirlo.
   *
   * Este es el eslabón que faltaba. `repartirVideo` arregla la ranura del que
   * EMITE, pero quien solo mira no ejecuta nada de eso: si su ranura quedó
   * pactada `sendonly` --puede enviar, no recibir-- se queda así para siempre,
   * porque nada de lo que haga el otro la toca. En el diagnóstico se veía
   * `ranura sendonly` en el lado del que no ve, con el otro transmitiendo feliz.
   *
   * El aviso de "estoy compartiendo" es justo el momento de revisarlo: es la
   * única señal que dice que va a empezar a entrar video por ahí.
   */
  const abrirParaRecibir = useCallback(
    (otroId: string) => {
      const par = pares.current.get(otroId)
      if (!par) return

      if (!abrirRanuraDeVideo(par.pc, par.senderVideoPantalla)) {
        // Ya quedó bien: se olvidan los intentos, para que un problema futuro
        // vuelva a tener sus oportunidades.
        par.intentosRanura = 0
        return
      }

      if (par.intentosRanura >= MAX_INTENTOS_RANURA) {
        // Se deja de insistir, pero se dice. Callar acá dejaría a alguien sin ver
        // nada y sin ninguna pista de por qué.
        if (par.intentosRanura === MAX_INTENTOS_RANURA) {
          console.warn(
            '[llamada] no se pudo abrir la ranura de video con',
            otroId,
            '- el otro lado puede estar con una versión anterior; recargar ambos',
          )
          par.intentosRanura++
        }
        return
      }

      // Cambiar la dirección no tiene efecto hasta la próxima oferta, y esta vez
      // la tiene que hacer este lado: el otro cree que ya está todo negociado.
      if (par.pc.signalingState === 'stable') {
        par.intentosRanura++
        void ofrecer(otroId)
      }
    },
    [ofrecer],
  )

  const recibirSenal = useCallback(
    async (senal: SenalLlamada) => {
      if (senal.de === miIntegranteId) return

      if (senal.tipo === 'estado') {
        actualizar(senal.de, { micro: senal.micro, camara: senal.camara })
        if (senal.camara) abrirParaRecibir(senal.de)
        return
      }

      if (senal.tipo === 'pantalla') {
        actualizar(senal.de, { compartiendo: senal.activa })
        if (senal.activa) abrirParaRecibir(senal.de)
        return
      }

      if (senal.para !== miIntegranteId) return

      const par = crearPar(senal.de)

      try {
        if (senal.tipo === 'oferta') {
          await par.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp))

          // Antes de contestar, dejar la ranura en sendrecv. La respuesta define
          // qué acepta este lado: si contesta con la dirección torcida que traía
          // de una negociación anterior, el pacto queda en `sendonly` para el
          // otro y su video no vuelve a entrar nunca.
          abrirRanuraDeVideo(par.pc, par.senderVideoPantalla)

          for (const c of par.pendientes) {
            await par.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
          }
          par.pendientes = []

          const respuesta = await par.pc.createAnswer()
          await par.pc.setLocalDescription(respuesta)
          enviar({ tipo: 'respuesta', de: miIntegranteId, para: senal.de, sdp: respuesta })

          // Al contestar se avisa cómo está uno: el otro no puede deducir de un
          // track mudo si el micrófono está apagado o si simplemente no hablo.
          enviar({ tipo: 'estado', de: miIntegranteId, micro: microRef.current, camara: camaraRef.current })

          // Y si uno ya venía compartiendo, también. El aviso de "pantalla" se
          // manda una sola vez, al empezar: quien llegó después nunca se enteró y
          // veía la transmisión sin el rótulo, o el rótulo sin la transmisión.
          if (pantalla.current) {
            enviar({ tipo: 'pantalla', de: miIntegranteId, activa: true })
          }
        }

        if (senal.tipo === 'respuesta') {
          // Llega una respuesta a una oferta que ya no está en curso: es un eco de
          // una negociación vieja. Aplicarla rompería la conexión que ya funciona.
          if (par.pc.signalingState !== 'have-local-offer') return

          await par.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp))
          for (const c of par.pendientes) {
            await par.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
          }
          par.pendientes = []
        }

        if (senal.tipo === 'ice') {
          // Un candidato antes de la descripción remota se descarta si se aplica
          // ya: se guarda y se vuelca cuando el SDP esté puesto.
          if (!par.pc.remoteDescription) {
            par.pendientes.push(senal.candidato)
          } else {
            await par.pc.addIceCandidate(new RTCIceCandidate(senal.candidato)).catch(() => {})
          }
        }
      } catch (err) {
        console.error('[llamada] señal', senal.tipo, err)
      }
    },
    [abrirParaRecibir, actualizar, crearPar, enviar, miIntegranteId],
  )

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!llamadaId) return

    let vigente = true
    const supabase = createClient()
    const misPares = pares.current

    inicioRef.current = Date.now()
    viaRelayRef.current = false

    const arrancar = async () => {
      // 1. Micrófono y cámara. Si el usuario dice que no, se corta acá con un
      //    mensaje claro en vez de entrar a una llamada muda sin explicación.
      try {
        const perfil = perfilVideo(2)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: conVideo
            ? { width: { ideal: perfil.ancho }, height: { ideal: perfil.alto }, frameRate: { ideal: perfil.fps } }
            : false,
        })
        if (!vigente) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        local.current = stream
        pistaMicCrudaRef.current = stream.getAudioTracks()[0] ?? null
        setStreamLocal(stream)
      } catch {
        if (vigente) setError('No se pudo usar el micrófono. Revisa los permisos del navegador.')
        return
      }

      // 2. Por dónde atravesar los routers.
      try {
        const res = await fetch('/api/llamadas/ice')
        const json = await res.json()
        if (json.success) {
          iceServers.current = json.data.iceServers as RTCIceServer[]
          if (vigente) setHayTurn(Boolean(json.data.turn))
        }
      } catch {
        iceServers.current = [{ urls: ['stun:stun.cloudflare.com:3478'] }]
        if (vigente) setHayTurn(false)
      }

      if (!vigente) return

      // 3. La central telefónica. Presence dice quién está dentro ahora mismo, que
      //    es más confiable que la tabla: si a alguien se le corta la luz, la fila
      //    queda pero Presence lo saca solo.
      const ch = supabase.channel(canalLlamada(llamadaId), {
        config: { presence: { key: miIntegranteId }, broadcast: { self: false } },
      })
      canal.current = ch

      ch.on('broadcast', { event: EVENTO_SENAL }, ({ payload }) => {
        void recibirSenal(payload as SenalLlamada)
      })

      ch.on('presence', { event: 'sync' }, () => {
        const dentro = Object.keys(ch.presenceState()).filter((id) => id !== miIntegranteId)

        // Quien se fue, se va: cerrar el par libera la cámara del recuadro y saca
        // el rectángulo negro que quedaba colgado.
        for (const id of misPares.keys()) {
          if (!dentro.includes(id)) cerrarPar(id)
        }

        // `debeOfrecer` reparte quién llama a quién por orden de UUID. Sin esa
        // regla los dos ofrecen a la vez, las negociaciones chocan y la conexión
        // nunca se levanta.
        for (const id of dentro) {
          if (!misPares.has(id) && debeOfrecer(miIntegranteId, id)) void ofrecer(id)
          else if (!misPares.has(id)) crearPar(id)
        }

        aplicarCalidad()
      })

      ch.subscribe((estado) => {
        if (estado === 'SUBSCRIBED') {
          void ch.track({ desde: new Date().toISOString() })
        }
      })
    }

    void arrancar()

    return () => {
      vigente = false
      for (const id of [...misPares.keys()]) cerrarPar(id)
      local.current?.getTracks().forEach((t) => t.stop())
      pantalla.current?.getTracks().forEach((t) => t.stop())
      // Si la supresión de ruido estaba activa, `local.current` llevaba la
      // pista PROCESADA, no la cruda -- pararla a ella no apaga el micrófono
      // físico, solo el nodo de salida del grafo de audio. Sin esto, la luz
      // del micrófono podía quedar encendida después de colgar.
      pistaMicCrudaRef.current?.stop()
      pistaMicCrudaRef.current = null
      nodoRuidoRef.current?.destroy()
      nodoRuidoRef.current = null
      try {
        fuenteRuidoRef.current?.disconnect()
        destinoRuidoRef.current?.disconnect()
      } catch {
        // Ya desconectado.
      }
      fuenteRuidoRef.current = null
      destinoRuidoRef.current = null
      void ctxRuidoRef.current?.close()
      ctxRuidoRef.current = null
      local.current = null
      pantalla.current = null
      setStreamLocal(null)
      setStreamPantalla(null)
      setParticipantes([])
      if (canal.current) supabase.removeChannel(canal.current)
      canal.current = null
    }
    // `conVideo` y los callbacks son estables durante una llamada; incluirlos
    // rearmaría la malla entera al vuelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llamadaId, miIntegranteId])

  // ── Controles ─────────────────────────────────────────────────────────────

  const alternarMicro = useCallback(() => {
    const pista = local.current?.getAudioTracks()[0]
    if (!pista) return
    pista.enabled = !pista.enabled
    setMicro(pista.enabled)
    enviar({ tipo: 'estado', de: miIntegranteId, micro: pista.enabled, camara: camaraRef.current })
  }, [enviar, miIntegranteId])

  /**
   * Prender o apagar la supresión de ruido tipo Discord (RNNoise por WASM).
   *
   * Reemplaza la pista que se está enviando por su versión procesada (o al
   * revés, para apagarla), en cada conexión abierta, con `replaceTrack` --
   * como es audio por audio no hace falta renegociar nada, igual que al
   * silenciar el micrófono.
   *
   * Si algo del pipeline falla (WASM no soportado, AudioWorklet bloqueado,
   * lo que sea), se avisa con un toast y se sigue con el micrófono normal:
   * esto nunca debe poder dejar a alguien sin micrófono.
   */
  const alternarSupresionRuido = useCallback(async () => {
    const cruda = pistaMicCrudaRef.current
    if (!cruda) return

    if (ruidoSuprimido) {
      for (const [, par] of pares.current) {
        const sender = senderDeMicrofono(par.pc, par)
        if (sender) await sender.replaceTrack(cruda).catch(() => {})
      }
      cruda.enabled = microRef.current
      if (local.current) {
        const vieja = local.current.getAudioTracks()[0]
        if (vieja && vieja !== cruda) {
          local.current.removeTrack(vieja)
          local.current.addTrack(cruda)
        }
      }
      nodoRuidoRef.current?.destroy()
      nodoRuidoRef.current = null
      try {
        fuenteRuidoRef.current?.disconnect()
        destinoRuidoRef.current?.disconnect()
      } catch {
        // Ya desconectado.
      }
      fuenteRuidoRef.current = null
      destinoRuidoRef.current = null
      void ctxRuidoRef.current?.close()
      ctxRuidoRef.current = null
      setRuidoSuprimido(false)
      return
    }

    setCargandoSupresionRuido(true)
    try {
      // RNNoise asume 48kHz -- de ahí el sampleRate explícito, no vale confiar
      // en el que traiga el dispositivo por defecto.
      const ctx = new AudioContext({ sampleRate: 48000 })
      await ctx.audioWorklet.addModule('/audio/rnnoise-worklet.js')
      const wasmBinary = await loadRnnoise({
        url: '/audio/rnnoise.wasm',
        simdUrl: '/audio/rnnoise-simd.wasm',
      })
      const nodo = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
      const fuente = ctx.createMediaStreamSource(new MediaStream([cruda]))
      const destino = ctx.createMediaStreamDestination()
      fuente.connect(nodo)
      nodo.connect(destino)

      const procesada = destino.stream.getAudioTracks()[0]
      if (!procesada) throw new Error('el nodo de salida no entregó ninguna pista')
      procesada.enabled = microRef.current

      ctxRuidoRef.current = ctx
      nodoRuidoRef.current = nodo
      fuenteRuidoRef.current = fuente
      destinoRuidoRef.current = destino

      for (const [, par] of pares.current) {
        const sender = senderDeMicrofono(par.pc, par)
        if (sender) await sender.replaceTrack(procesada).catch(() => {})
      }
      if (local.current) {
        const vieja = local.current.getAudioTracks()[0]
        if (vieja) local.current.removeTrack(vieja)
        local.current.addTrack(procesada)
      }
      setRuidoSuprimido(true)
    } catch (err) {
      console.error('[llamada] no se pudo activar la supresión de ruido', err)
      toast.error('No se pudo activar la supresión de ruido', {
        description: 'Seguís con el micrófono normal.',
      })
      nodoRuidoRef.current?.destroy()
      nodoRuidoRef.current = null
      fuenteRuidoRef.current = null
      destinoRuidoRef.current = null
      void ctxRuidoRef.current?.close()
      ctxRuidoRef.current = null
    } finally {
      setCargandoSupresionRuido(false)
    }
  }, [ruidoSuprimido])

  const alternarCamara = useCallback(async () => {
    const pista = local.current?.getVideoTracks()[0]

    // Empezó en audio y ahora quiere video: la pista no existe, hay que pedirla y
    // agregarla a las conexiones que ya están abiertas.
    if (!pista) {
      try {
        const perfil = perfilVideo(pares.current.size + 1)
        const extra = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: perfil.ancho }, height: { ideal: perfil.alto } },
        })
        const nueva = extra.getVideoTracks()[0]
        local.current?.addTrack(nueva)

        // La ranura ya existe desde `crearPar`, así que basta con llenarla. Antes
        // esto hacía `addTrack` + renegociación, que es justo lo que dejaba al
        // otro lado en negro cuando la renegociación no llegaba a completarse.
        await repartirVideo(nueva)

        setCamara(true)
        aplicarCalidad()
        enviar({ tipo: 'estado', de: miIntegranteId, micro: microRef.current, camara: true })
      } catch {
        setError('No se pudo encender la cámara.')
      }
      return
    }

    pista.enabled = !pista.enabled
    setCamara(pista.enabled)
    enviar({ tipo: 'estado', de: miIntegranteId, micro: microRef.current, camara: pista.enabled })
  }, [aplicarCalidad, enviar, miIntegranteId, repartirVideo])

  /**
   * Saca la pantalla de las conexiones. Ya no toca la cámara para nada -- son
   * pistas independientes desde que se abrieron como senders separados, así
   * que dejar de compartir no le hace nada a lo que la cámara esté mandando
   * (prendida o apagada, como estuviera).
   *
   * Va en su propia función y no dentro de `alternarPantalla` porque el botón
   * "Dejar de compartir" del navegador tiene que poder llamarla, y una función
   * no puede referenciarse a sí misma dentro de su propio `useCallback`.
   */
  const dejarDeCompartir = useCallback(async () => {
    if (!pantalla.current) return

    await repartirVideoPantalla(null, null)
    await repartirAudioPantalla(null, null)
    pantalla.current.getTracks().forEach((t) => t.stop())
    pantalla.current = null
    setStreamPantalla(null)
    setCompartiendo(false)
    aplicarCalidad()
    enviar({ tipo: 'pantalla', de: miIntegranteId, activa: false })
  }, [aplicarCalidad, enviar, miIntegranteId, repartirAudioPantalla, repartirVideoPantalla])

  const alternarPantalla = useCallback(async () => {
    if (pantalla.current) {
      await dejarDeCompartir()
      return
    }

    try {
      // `audio: true` solo pide el permiso; el navegador decide si lo puede
      // cumplir. Compartiendo una pestaña de Chrome con "Compartir audio de
      // la pestaña" tildado, llega. Compartiendo una ventana o el escritorio
      // entero, la mayoría de los navegadores no ofrecen esa opción y el
      // stream simplemente no trae pista de audio -- no es un error, es
      // audio: false silencioso, así que el resto del código lo trata como
      // opcional en todo momento.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
        /**
         * Se probó `{ echoCancellation: true, noiseSuppression: true,
         * autoGainControl: false }` acá para el eco (#159: quien comparte
         * escuchaba su propia voz rebotada, porque el audio de sistema
         * captura lo que sale por sus parlantes, incluida la llamada
         * sonando ahí mismo). Rebotó en producción: en el equipo de
         * Ignacio, la pista de audio de pantalla quedaba `muted: true` a
         * nivel de WebRTC -- viva pero sin datos, silencio total del otro
         * lado -- confirmado leyendo el estado real de la pista en la
         * consola del navegador. echoCancellation/noiseSuppression están
         * pensados para señal de MICRÓFONO; aplicados a una captura de
         * audio de sistema, en algunos equipos degradan la señal a
         * silencio en vez de solo cancelar el eco.
         *
         * Silencio total es peor que un eco ocasional -- se vuelve a
         * `audio: true` a secas. El eco de #159 queda sin resolver (mitigar
         * con auriculares mientras se comparte pantalla con audio).
         */
        audio: true,
      })
      const pista = stream.getVideoTracks()[0]
      pantalla.current = stream
      setStreamPantalla(stream)

      // Pista aparte de la cámara -- no toca su ranura para nada. Si la
      // cámara estaba prendida, sigue mandando exactamente igual que antes
      // de empezar a compartir.
      await repartirVideoPantalla(pista, stream)

      const pistaAudio = stream.getAudioTracks()[0] ?? null
      if (pistaAudio) await repartirAudioPantalla(pistaAudio, stream)

      // El botón "Dejar de compartir" del navegador no pasa por nuestra UI: sin
      // este handler la app seguiría creyendo que se comparte.
      pista.onended = () => void dejarDeCompartir()

      setCompartiendo(true)
      aplicarCalidad()
      enviar({ tipo: 'pantalla', de: miIntegranteId, activa: true })
    } catch {
      // El usuario canceló el selector de ventana. No es un error que avisar.
    }
  }, [aplicarCalidad, dejarDeCompartir, enviar, miIntegranteId, repartirAudioPantalla, repartirVideoPantalla])

  /**
   * Cada dos segundos se pregunta a WebRTC cuántos paquetes de audio salieron y
   * entraron. Es la única fuente que dice la verdad: el permiso del navegador y
   * el indicador de voz dicen si el micrófono ENTRA a la app, no si SALE hacia
   * los demás.
   */
  useEffect(() => {
    if (!llamadaId) return

    const medir = async () => {
      const pista = local.current?.getAudioTracks()[0]
      const porPersona: DiagnosticoLlamada['porPersona'] = []

      for (const [otroId, { pc }] of pares.current) {
        const par = pares.current.get(otroId)
        let enviados = 0
        let recibidos = 0
        let videoEnviado = 0
        let videoRecibido = 0
        try {
          const stats = await pc.getStats()
          stats.forEach((r) => {
            const rtp = r as RTCOutboundRtpStreamStats & RTCInboundRtpStreamStats
            if (r.type === 'outbound-rtp' && rtp.kind === 'audio') enviados += rtp.packetsSent ?? 0
            if (r.type === 'inbound-rtp' && rtp.kind === 'audio') recibidos += rtp.packetsReceived ?? 0
            if (r.type === 'outbound-rtp' && rtp.kind === 'video') videoEnviado += rtp.packetsSent ?? 0
            if (r.type === 'inbound-rtp' && rtp.kind === 'video') videoRecibido += rtp.packetsReceived ?? 0
          })
        } catch {
          // Una conexión que ya se cerró no tiene estadísticas. No es un fallo.
        }

        /**
         * La dirección negociada de la ranura de video.
         *
         * Es el dato que separa "no me mandan" de "no puedo recibir": si acá dice
         * `sendonly`, esta conexión quedó pactada para enviar y no recibir, y por
         * mucho que el otro transmita nunca va a llegar nada. Eso no se ve en
         * ningún otro lado y es invisible desde la interfaz.
         */
        // Sin contar la ranura de pantalla: con ella activa es NORMAL tener
        // dos transceivers de video a la vez, no es el bug que este
        // diagnóstico busca detectar.
        const trVideo = ranuraDeVideo(pc, par?.senderVideoPantalla)
        // Cuántas ranuras de CÁMARA tiene la conexión. Más de una significa que
        // la negociación dejó m-lines de sobra, y ahí es donde el video se va
        // por un tubo que no está conectado a nada.
        const ranuras = transceiversDeVideo(pc, par?.senderVideoPantalla).length

        porPersona.push({
          id: otroId,
          paquetesEnviados: enviados,
          paquetesRecibidos: recibidos,
          videoEnviado,
          videoRecibido,
          direccionVideo: trVideo?.currentDirection ?? trVideo?.direction ?? 'sin ranura',
          ranurasVideo: ranuras,
        })

        /**
         * Autorreparación: una ranura que no puede recibir se arregla sola.
         *
         * Los avisos de "estoy compartiendo" viajan por señalización y se pueden
         * perder -- una pestaña dormida, una reconexión, un cliente que todavía
         * no recargó. Si se pierde, la ranura torcida no la toca nadie y el
         * síntoma es permanente: "ellos me ven y yo no veo a nadie", sin forma de
         * salir salvo recargar los dos.
         *
         * Como esto ya corre cada dos segundos para el diagnóstico, revisarlo acá
         * no cuesta nada. Converge: al quedar en `sendrecv`,
         * `abrirRanuraDeVideo` devuelve false y no vuelve a renegociar.
         */
        const pactada = trVideo?.currentDirection
        if (pactada === 'sendonly' || pactada === 'inactive') {
          abrirParaRecibir(otroId)
        }
      }

      setDiagnostico({
        pistaLocal: {
          existe: Boolean(pista),
          // `enabled` es nuestro interruptor de silencio.
          activa: pista?.enabled ?? false,
          // `muted` lo pone el sistema, no nosotros: micrófono desconectado,
          // tomado por otra aplicación, o silenciado a nivel de sistema
          // operativo. Es una causa que la app no puede arreglar, solo señalar.
          silenciadaPorSistema: pista?.muted ?? false,
          estado: pista?.readyState ?? 'sin pista',
        },
        porPersona,
      })
    }

    void medir()
    const id = window.setInterval(medir, 2000)
    return () => window.clearInterval(id)
  }, [llamadaId, abrirParaRecibir])

  const colgar = useCallback(async () => {
    if (!llamadaId) return
    try {
      await fetch(`/api/llamadas/${llamadaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // `keepalive` deja que el request termine aunque la pestaña se esté
        // cerrando en ese mismo instante (ej. se dispara desde `pagehide`
        // más abajo): sin esto el navegador puede abortarlo a mitad de vuelo.
        keepalive: true,
        body: JSON.stringify({
          accion: 'salir',
          // El navegador es el unico que sabe por donde fue el trafico. Si esto
          // no llega, la fila queda con via_relay NULL y el resumen lo cuenta
          // como "sin medir" en vez de suponer.
          via_relay: viaRelayRef.current,
          segundos: Math.max(0, Math.round((Date.now() - inicioRef.current) / 1000)),
        }),
      })
    } catch {
      // Aunque el aviso al servidor falle, hay que soltar cámara y micrófono: la
      // luz de la webcam encendida después de colgar es lo peor que puede pasar.
    }
    onTerminada?.()
  }, [llamadaId, onTerminada])

  // Cerrar la pestaña o navegar afuera no dispara ningún cleanup que avise al
  // servidor -- sin esto la fila queda "en_llamada" hasta que el barrido de
  // zombis la limpia, horas después. `pagehide` es más confiable que
  // `beforeunload` para esto (sigue funcionando con bfcache).
  const colgarRef = useRef(colgar)
  useEffect(() => {
    colgarRef.current = colgar
  }, [colgar])
  useEffect(() => {
    if (!llamadaId) return
    const alSalir = () => void colgarRef.current()
    window.addEventListener('pagehide', alSalir)
    return () => window.removeEventListener('pagehide', alSalir)
  }, [llamadaId])

  return {
    participantes,
    conexion,
    diagnostico,
    streamLocal,
    streamPantalla,
    micro,
    camara,
    compartiendo,
    error,
    hayTurn,
    ruidoSuprimido,
    cargandoSupresionRuido,
    alternarMicro,
    alternarCamara,
    alternarPantalla,
    alternarSupresionRuido,
    colgar,
  }
}
