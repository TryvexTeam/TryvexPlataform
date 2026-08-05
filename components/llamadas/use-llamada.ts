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
  /** Candidatos que llegaron antes que la descripción remota. Sin esta cola se
   *  pierden y la conexión queda a medio armar en redes lentas. */
  pendientes: RTCIceCandidateInit[]
  /** Evita aplicar dos ofertas cruzadas ("glare") sobre la misma conexión. */
  negociando: boolean
}

export function useLlamada({ llamadaId, miIntegranteId, conVideo, onTerminada }: UseLlamadaOpts) {
  const [participantes, setParticipantes] = useState<ParticipanteVivo[]>([])
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

      const par: Par = { pc, pendientes: [], negociando: false }
      pares.current.set(otroId, par)

      for (const track of local.current?.getTracks() ?? []) {
        pc.addTrack(track, local.current!)
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          enviar({ tipo: 'ice', de: miIntegranteId, para: otroId, candidato: ev.candidate.toJSON() })
        }
      }

      pc.ontrack = (ev) => {
        actualizar(otroId, { stream: ev.streams[0] ?? null })
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

  const recibirSenal = useCallback(
    async (senal: SenalLlamada) => {
      if (senal.de === miIntegranteId) return

      if (senal.tipo === 'estado') {
        actualizar(senal.de, { micro: senal.micro, camara: senal.camara })
        return
      }

      if (senal.tipo === 'pantalla') {
        actualizar(senal.de, { compartiendo: senal.activa })
        return
      }

      if (senal.para !== miIntegranteId) return

      const par = crearPar(senal.de)

      try {
        if (senal.tipo === 'oferta') {
          await par.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp))

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
    [actualizar, crearPar, enviar, miIntegranteId],
  )

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!llamadaId) return

    let vigente = true
    const supabase = createClient()
    const misPares = pares.current

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

        for (const [otroId, { pc }] of pares.current) {
          pc.addTrack(nueva, local.current!)
          // Agregar una pista obliga a renegociar; si no, el otro no la ve nunca.
          void ofrecer(otroId)
        }

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
  }, [aplicarCalidad, enviar, miIntegranteId, ofrecer])

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

    const camaraPista = local.current?.getVideoTracks()[0] ?? null
    for (const { pc } of pares.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(camaraPista).catch(() => {})
    }
    pantalla.current.getTracks().forEach((t) => t.stop())
    pantalla.current = null
    setStreamPantalla(null)
    setCompartiendo(false)
    aplicarCalidad()
    enviar({ tipo: 'pantalla', de: miIntegranteId, activa: false })
  }, [aplicarCalidad, enviar, miIntegranteId])

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

      for (const { pc } of pares.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(pista).catch(() => {})
        else pc.addTrack(pista, stream)
      }

      // El botón "Dejar de compartir" del navegador no pasa por nuestra UI: sin
      // este handler la app seguiría creyendo que se comparte.
      pista.onended = () => void dejarDeCompartir()

      setCompartiendo(true)
      aplicarCalidad()
      enviar({ tipo: 'pantalla', de: miIntegranteId, activa: true })
    } catch {
      // El usuario canceló el selector de ventana. No es un error que avisar.
    }
  }, [aplicarCalidad, dejarDeCompartir, enviar, miIntegranteId])

  const colgar = useCallback(async () => {
    if (!llamadaId) return
    try {
      await fetch(`/api/llamadas/${llamadaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'salir' }),
      })
    } catch {
      // Aunque el aviso al servidor falle, hay que soltar cámara y micrófono: la
      // luz de la webcam encendida después de colgar es lo peor que puede pasar.
    }
    onTerminada?.()
  }, [llamadaId, onTerminada])

  return {
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
  }
}
