'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
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
}

/**
 * La ranura de video de una conexión.
 *
 * Se busca por el transceiver y no por `sender.track?.kind`: cuando la ranura
 * está vacía —llamada que empezó en audio— el sender no tiene pista y no hay
 * `kind` que mirar. El receiver sí declara 'video' desde que se crea.
 */
function transceiversDeVideo(pc: RTCPeerConnection): RTCRtpTransceiver[] {
  return pc.getTransceivers().filter(
    (t) =>
      // `stopped` como propiedad ya no existe: un transceiver detenido se
      // reconoce por su dirección actual.
      t.currentDirection !== 'stopped' &&
      (t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'),
  )
}

/**
 * LA ranura de video: la que está realmente negociada.
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
function ranuraDeVideo(pc: RTCPeerConnection): RTCRtpTransceiver | null {
  const todas = transceiversDeVideo(pc)
  // Sin negociar todavía no hay `mid`; ahí el primero es el que se va a usar.
  return todas.find((t) => t.mid !== null) ?? todas[0] ?? null
}

function senderDeVideo(pc: RTCPeerConnection): RTCRtpSender | null {
  return ranuraDeVideo(pc)?.sender ?? null
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
function abrirRanuraDeVideo(pc: RTCPeerConnection): boolean {
  const tr = ranuraDeVideo(pc)
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

  const pares = useRef(new Map<string, Par>())
  const canal = useRef<RealtimeChannel | null>(null)
  const local = useRef<MediaStream | null>(null)
  const pantalla = useRef<MediaStream | null>(null)
  const iceServers = useRef<RTCIceServer[]>([])
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

    for (const { pc } of pares.current.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
        params.encodings[0].maxBitrate = pantalla.current ? BITRATE_PANTALLA : perfil.maxBitrate
        params.encodings[0].maxFramerate = pantalla.current ? 15 : perfil.fps
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

      const par: Par = { pc, pistas: new Map(), pendientes: [], negociando: false }
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
       * La pantalla NO vive en `local.current` -- vive en `pantalla.current` y se
       * reparte con `replaceTrack` sobre los pares que existían en ese momento.
       * Una conexión creada después se quedaba con la ranura de video vacía para
       * siempre: nadie volvía a llenarla. El que comparte seguía viéndose bien,
       * porque lee su propia pantalla en local, y el otro veía negro mientras el
       * cartel de "está transmitiendo" sí aparecía, porque eso viaja por la
       * señalización y no por la media.
       *
       * Pasa con quien entra tarde a la llamada, y también en cada reconexión:
       * `presence sync` cierra el par caído y crea uno nuevo.
       */
      const pistaPantalla = pantalla.current?.getVideoTracks()[0]
      if (pistaPantalla) {
        const sender = senderDeVideo(pc)
        if (sender) void sender.replaceTrack(pistaPantalla).catch(() => {})
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
        // no se acumulan.
        p.pistas.set(ev.track.kind, ev.track)

        // Un MediaStream NUEVO en cada cambio, a propósito: mutar el existente no
        // le avisa a React ni al elemento <video>, que ya tiene ese objeto en
        // `srcObject` y no vuelve a mirarlo.
        const rehacer = () => {
          const vivo = pares.current.get(otroId)
          if (!vivo) return
          actualizar(otroId, { stream: new MediaStream([...vivo.pistas.values()]) })
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
          vivo.pistas.delete(ev.track.kind)
          rehacer()
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
        const hayQueRenegociar = abrirRanuraDeVideo(pc)
        const ranura = ranuraDeVideo(pc)

        // La pista va en la ranura negociada y en ninguna otra. Si hay más de un
        // transceiver de video, dejar la pista colgada en el que no está atado a
        // una m-line es exactamente lo que producía `envío 0` mientras la ranura
        // decía `sendrecv`: el video salía hacia un tubo que no existe.
        for (const t of transceiversDeVideo(pc)) {
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
      if (!abrirRanuraDeVideo(par.pc)) return

      // Cambiar la dirección no tiene efecto hasta la próxima oferta, y esta vez
      // la tiene que hacer este lado: el otro cree que ya está todo negociado.
      if (par.pc.signalingState === 'stable') void ofrecer(otroId)
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
          abrirRanuraDeVideo(par.pc)

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
   * Devuelve la cámara a su lugar con `replaceTrack`, que no obliga a renegociar.
   * Volver a ofrecer acá cortaría el audio un instante.
   *
   * Va en su propia función y no dentro de `alternarPantalla` porque el botón
   * "Dejar de compartir" del navegador tiene que poder llamarla, y una función
   * no puede referenciarse a sí misma dentro de su propio `useCallback`.
   */
  const dejarDeCompartir = useCallback(async () => {
    if (!pantalla.current) return

    // Si la cámara está apagada esto pone null: la ranura queda vacía y el otro
    // lado deja de recibir cuadros, que es lo correcto.
    const camaraPista = local.current?.getVideoTracks()[0] ?? null
    await repartirVideo(camaraPista)
    pantalla.current.getTracks().forEach((t) => t.stop())
    pantalla.current = null
    setStreamPantalla(null)
    setCompartiendo(false)
    aplicarCalidad()
    enviar({ tipo: 'pantalla', de: miIntegranteId, activa: false })
  }, [aplicarCalidad, enviar, miIntegranteId, repartirVideo])

  const alternarPantalla = useCallback(async () => {
    if (pantalla.current) {
      await dejarDeCompartir()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
        audio: false,
      })
      const pista = stream.getVideoTracks()[0]
      pantalla.current = stream
      setStreamPantalla(stream)

      await repartirVideo(pista)

      // El botón "Dejar de compartir" del navegador no pasa por nuestra UI: sin
      // este handler la app seguiría creyendo que se comparte.
      pista.onended = () => void dejarDeCompartir()

      setCompartiendo(true)
      aplicarCalidad()
      enviar({ tipo: 'pantalla', de: miIntegranteId, activa: true })
    } catch {
      // El usuario canceló el selector de ventana. No es un error que avisar.
    }
  }, [aplicarCalidad, dejarDeCompartir, enviar, miIntegranteId, repartirVideo])

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
        const trVideo = ranuraDeVideo(pc)
        // Cuántas ranuras de video tiene la conexión. Más de una significa que la
        // negociación dejó m-lines de sobra, y ahí es donde el video se va por un
        // tubo que no está conectado a nada.
        const ranuras = transceiversDeVideo(pc).length

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
    alternarMicro,
    alternarCamara,
    alternarPantalla,
    colgar,
  }
}
