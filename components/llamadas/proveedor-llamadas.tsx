'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { PhoneIcon, PhoneOffIcon, VideoIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { AvatarChat } from '@/components/chat/avatar-chat'
import type { Llamada } from '@/lib/types/llamada'
import { PanelLlamada } from './panel-llamada'

export interface PersonaLlamada {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
}

interface ContextoLlamadas {
  /** Llama (o se une) en una conversación. Devuelve si se pudo. */
  llamar: (conversacionId: string, opciones?: { conVideo?: boolean; titulo?: string }) => Promise<boolean>
  /** Hay una llamada en curso en esta pantalla. */
  enLlamada: boolean
  /** La conversación de la llamada activa, para pintar el botón como "unirse". */
  conversacionActiva: string | null
}

const Contexto = createContext<ContextoLlamadas | null>(null)

/**
 * El timbre: dos notas que suben y se quedan arriba (La5 → Mi6 → La6).
 *
 * Sube en vez de bajar porque una figura descendente se lee como algo que se
 * cierra -- sirve para colgar, no para avisar. Y son notas de un acorde, no
 * frecuencias sueltas: dos tonos sin relación entre sí suenan a alarma.
 */
const NOTAS = [880, 1318.5, 1760]

/** Cada cuánto vuelve a sonar, en ms. Ver `pulso`. */
const CADENCIA_MS = 2400

/**
 * Nombre único por montaje del canal de Realtime.
 *
 * supabase-js cachea los canales POR NOMBRE y `removeChannel` es asíncrono. Con
 * un nombre fijo, un remontaje del proveedor se encuentra con el canal anterior
 * todavía vivo: los `.on()` nuevos se agregan a un canal ya suscrito, que es un
 * error, y la suscripción queda en pie SIN handlers. El socket sigue conectado,
 * no hay nada roto a la vista, y los eventos de llamadas simplemente no llegan
 * nunca -- mientras el chat y las notificaciones siguen funcionando, porque esos
 * sí usan nombre único (ver `use-datos-vivos` y `chat-llamada`).
 *
 * Ese era el motivo de que llegara la notificación push de una llamada y en la
 * app no apareciera nada.
 */
let contadorCanal = 0

/**
 * El contexto de audio del timbre, desbloqueado con el primer gesto de la
 * sesión.
 *
 * Sin esto el timbre no suena y nadie sabe por qué: el navegador crea todo
 * AudioContext en pausa hasta que la persona toca la página, y una llamada
 * entrante no es un gesto de la persona -- llega justo cuando uno está leyendo,
 * sin tocar nada. `resume()` en ese momento no sirve: la política pide un gesto
 * *previo*, y el que uno haga después de ver el modal ya llega tarde.
 *
 * Entonces se toma el primer clic o tecla que ocurra en la sesión, sea cual sea,
 * y se deja el contexto abierto y corriendo. Cuando llegue la llamada ya está
 * listo. Es un contexto en reposo: no consume nada mientras no se le conecte un
 * oscilador.
 *
 * Es global al módulo y no un estado: sobrevive a cualquier remontaje del
 * proveedor, y desbloquear dos veces no tiene sentido.
 */
let ctxTimbre: AudioContext | null = null

function contextoTimbre(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctxTimbre) {
    // Los navegadores pueden volver a pausarlo (cambio de pestaña, ahorro de
    // energía). Pedir `resume` acá sí funciona: ya hubo un gesto antes.
    if (ctxTimbre.state === 'suspended') void ctxTimbre.resume().catch(() => {})
    return ctxTimbre
  }

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctxTimbre = new Ctor()
    void ctxTimbre.resume().catch(() => {})
    return ctxTimbre
  } catch {
    return null
  }
}

export function useLlamadas(): ContextoLlamadas {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useLlamadas fuera del ProveedorLlamadas')
  return ctx
}

interface ProveedorLlamadasProps {
  miIntegranteId: string
  equipo: PersonaLlamada[]
  children: React.ReactNode
}

/**
 * Vive en el layout, encima de todas las páginas. Dos razones:
 *
 * 1. Una llamada entrante tiene que sonar estés en leads, en finanzas o donde
 *    sea. Si el timbre viviera en el chat, solo sonaría con el chat abierto.
 * 2. La llamada no se corta al navegar. Montada acá arriba, cambiar de página no
 *    desmonta el panel ni las conexiones.
 */
export function ProveedorLlamadas({ miIntegranteId, equipo, children }: ProveedorLlamadasProps) {
  const [activa, setActiva] = useState<{ llamada: Llamada; titulo: string } | null>(null)
  const [entrante, setEntrante] = useState<Llamada | null>(null)
  /**
   * Una llamada que ya estaba andando cuando uno llegó.
   *
   * Va aparte de `entrante` porque no es lo mismo y no debe comportarse igual:
   * empezó hace rato, nadie está esperando al teléfono, y timbrar sin parar por
   * algo que lleva diez minutos es acoso, no un aviso. Suena una vez y ofrece
   * unirse.
   */
  const [enCurso, setEnCurso] = useState<Llamada | null>(null)
  /** Llamadas que ya se ofrecieron o se descartaron: no volver a ofrecerlas. */
  const vistas = useRef<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState(false)

  const porId = new Map(equipo.map((p) => [p.id, p]))
  const timbre = useRef<{ ctx: AudioContext; parar: () => void } | null>(null)
  /**
   * Dedupe de `buscarEnCurso`: se dispara desde tres sitios en cada montaje
   * (efecto de arranque, callback SUBSCRIBED del canal, y visibilitychange/
   * focus), lo que provocaba hasta 3 `GET /api/llamadas/activas` por carga.
   * `enVuelo` corta las simultáneas; `ultima` ignora las que llegan pisadas.
   */
  const buscando = useRef(false)
  const ultimaBusqueda = useRef(0)
  const MIN_ENTRE_BUSQUEDAS_MS = 1500

  const pararTimbre = useCallback(() => {
    timbre.current?.parar()
    timbre.current = null
  }, [])

  /**
   * El timbre se sintetiza en vez de cargar un mp3: pesa cero, no hay un archivo
   * más que servir y no depende de que la red lo entregue a tiempo -- un timbre
   * que llega tarde no es un timbre. Si el navegador lo bloquea por no haber
   * gesto previo del usuario, no pasa nada: el modal y la notificación push
   * siguen avisando.
   */
  const sonar = useCallback(() => {
    try {
      // El contexto ya viene desbloqueado desde el primer gesto de la sesión.
      // Crear uno nuevo acá era lo que dejaba el timbre mudo: nacía en pausa y
      // la llamada entrante no cuenta como gesto de la persona.
      const ctx = contextoTimbre()
      if (!ctx) return

      const ganancia = ctx.createGain()
      ganancia.gain.value = 0.14
      ganancia.connect(ctx.destination)

      let vivo = true

      /**
       * Un toque: las tres notas seguidas, y silencio hasta el siguiente. Se
       * repite hasta que se conteste o se rechace -- no se rinde a los tres
       * intentos. Una llamada a la que nadie llega es una llamada perdida; si el
       * timbre se apaga solo, ni siquiera es eso.
       */
      const pulso = () => {
        if (!vivo) return
        for (const [i, hz] of NOTAS.entries()) {
          const t = ctx.currentTime + i * 0.17

          /**
           * Dos osciladores por nota: la fundamental y su octava, esta última
           * bastante más baja. Una sinusoide sola suena a pitido de aparato
           * médico; el armónico encima le da el cuerpo de campana que uno asocia
           * a una notificación y no a una alarma.
           */
          for (const [armonico, volumen] of [
            [1, 1],
            [2, 0.32],
          ]) {
            const osc = ctx.createOscillator()
            const env = ctx.createGain()
            osc.type = 'triangle'
            osc.frequency.value = hz * armonico

            // Ataque instantáneo y cola que decae sola, como algo que se golpea.
            // La envolvente cuadrada de antes sonaba a error del sistema.
            env.gain.setValueAtTime(0, t)
            env.gain.linearRampToValueAtTime(volumen, t + 0.012)
            env.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)

            osc.connect(env)
            env.connect(ganancia)
            osc.start(t)
            osc.stop(t + 0.75)
          }
        }

        // En el teléfono la vibración llega donde el sonido no: con el aparato
        // en silencio, es lo único que avisa.
        if ('vibrate' in navigator) navigator.vibrate([120, 90, 120, 700])
      }

      pulso()
      const id = window.setInterval(pulso, CADENCIA_MS)

      timbre.current = {
        ctx,
        parar: () => {
          vivo = false
          window.clearInterval(id)
          if ('vibrate' in navigator) navigator.vibrate(0)
          // El contexto NO se cierra: es el compartido y desbloqueado. Cerrarlo
          // dejaría la próxima llamada sin timbre hasta que la persona vuelva a
          // tocar la pantalla, que es justo el problema que esto resuelve.
          ganancia.disconnect()
        },
      }
    } catch {
      // Sin audio la llamada igual se ve en pantalla.
    }
  }, [])

  const tituloDeLlamada = useCallback(
    (llamada: Llamada): string => porId.get(llamada.iniciada_por)?.nombre ?? 'Llamada',
    // `porId` se rehace en cada render pero su contenido solo cambia si cambia el equipo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equipo],
  )

  /**
   * Preguntar si ya hay una llamada andando: al abrir la app y cada vez que la
   * pestaña vuelve al frente.
   *
   * Sin esto, enterarse dependía de estar suscrito en el instante exacto del
   * INSERT. Quien tenía la app cerrada recibía la notificación push -- "fulano
   * está en la llamada" -- y al abrir el CRM no encontraba nada: ni modal, ni
   * timbre, ni forma de entrar salvo ir a buscar el chat correcto. La push
   * avisaba de algo que la app después negaba.
   *
   * También al recuperar el foco, porque una pestaña de fondo puede perderse el
   * evento: los navegadores congelan sockets en pestañas dormidas.
   */
  const buscarEnCurso = useCallback(async () => {
    // Una a la vez, y no más de una cada MIN_ENTRE_BUSQUEDAS_MS: los tres
    // disparadores de arranque colapsan en una sola petición.
    if (buscando.current) return
    if (Date.now() - ultimaBusqueda.current < MIN_ENTRE_BUSQUEDAS_MS) return
    buscando.current = true
    ultimaBusqueda.current = Date.now()
    try {
      const res = await fetch('/api/llamadas/activas')
      const json = await res.json()
      if (!json.success) return

      const filas = json.data as { llamada: Llamada; dentro: string[] }[]
      const ajena = filas.find(
        (f) =>
          // Si ya estoy dentro no hay nada que ofrecer.
          !f.dentro.includes(miIntegranteId) &&
          // Quien la abrió no se ofrece a sí mismo entrar a su propia llamada.
          f.llamada.iniciada_por !== miIntegranteId &&
          !vistas.current.has(f.llamada.id),
      )
      if (!ajena) return

      /**
       * Una que sigue SONANDO se trata como entrante de verdad: hay alguien
       * esperando al teléfono ahora mismo. Antes esto solo miraba las que ya
       * estaban `en_curso` y se perdía justo el caso que más importa -- llegar
       * un segundo tarde al evento de una llamada que todavía repica.
       */
      if (ajena.llamada.estado === 'sonando') {
        vistas.current.add(ajena.llamada.id)
        setEntrante((previa) => {
          if (previa) return previa
          sonar()
          return ajena.llamada
        })
        return
      }

      vistas.current.add(ajena.llamada.id)
      setEnCurso((previa) => {
        if (previa) return previa

        /**
         * Un toque y se calla, en vez del timbre insistente de una entrante.
         *
         * La diferencia no es estética: una llamada que empezó hace diez minutos
         * no tiene a nadie esperando al teléfono, y timbrar en bucle por eso es
         * acoso. Pero aparecer en silencio tampoco sirve -- un modal que sale sin
         * ruido mientras uno mira otra cosa es un modal que no se ve.
         */
        sonar()
        window.setTimeout(pararTimbre, 1200)
        return ajena.llamada
      })
    } catch {
      // Sin esto solo se pierde el ofrecimiento; el chat sigue mostrando la sala.
    } finally {
      buscando.current = false
    }
  }, [miIntegranteId, sonar, pararTimbre])

  // ── Escuchar llamadas ─────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase.channel(`llamadas-de-${miIntegranteId}-${++contadorCanal}`)
    // El CLOSED que llega cuando NOSOTROS cerramos el canal (remonte del layout,
    // StrictMode) es esperado y no significa que las llamadas dejen de llegar:
    // el canal nuevo ya quedó suscrito. Solo es señal de alarma un CLOSED que
    // aparece sin que hayamos pedido el cierre.
    let cerrandoAdrede = false

    canal
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas' }, ({ new: fila }) => {
        const llamada = fila as Llamada
        // La RLS ya filtra: solo llegan las de conversaciones donde uno está.
        if (llamada.iniciada_por === miIntegranteId) return
        if (llamada.estado !== 'sonando') return

        setEntrante((previa) => {
          // Ya hay una sonando o uno ya está hablando: no encimar dos timbres.
          if (previa) return previa
          sonar()
          return llamada
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'llamadas' }, ({ new: fila }) => {
        const llamada = fila as Llamada
        if (llamada.estado !== 'terminada') return

        setEntrante((previa) => {
          if (previa?.id !== llamada.id) return previa
          pararTimbre()
          return null
        })
        // Si colgaron la que se estaba ofreciendo, el ofrecimiento sobra: unirse
        // a una llamada terminada deja a la persona sola en una sala vacía.
        setEnCurso((previa) => (previa?.id === llamada.id ? null : previa))
        setActiva((previa) => (previa?.llamada.id === llamada.id ? null : previa))
      })
      .subscribe((estado) => {
        /**
         * Una suscripción caída es invisible: el socket sigue conectado, no hay
         * error en pantalla y las llamadas simplemente no llegan. Dejar rastro en
         * la consola es la diferencia entre diagnosticarlo en un minuto y probar
         * a ciegas entre dos personas.
         *
         * Al reconectar se vuelve a preguntar qué hay vivo: mientras el canal
         * estuvo caído pudo empezar una llamada, y ese evento ya no vuelve.
         */
        if (estado === 'CLOSED' && cerrandoAdrede) {
          console.debug('[llamadas] canal de Realtime cerrado (remonte esperado)')
          return
        }
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          console.warn('[llamadas] canal de Realtime en estado', estado)
          return
        }
        if (estado === 'SUBSCRIBED') void buscarEnCurso()
      })

    return () => {
      cerrandoAdrede = true
      pararTimbre()
      supabase.removeChannel(canal)
    }
  }, [miIntegranteId, pararTimbre, sonar, buscarEnCurso])

  // Soltar el timbre si el componente muere con una llamada sonando.
  useEffect(() => () => pararTimbre(), [pararTimbre])


  useEffect(() => {
    // Solo si no estoy ya en una llamada: ofrecerle otra a alguien que está
    // hablando es interrumpirlo.
    if (activa) return

    void buscarEnCurso()

    const alVolver = () => {
      if (document.visibilityState === 'visible') void buscarEnCurso()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [buscarEnCurso, activa])

  /**
   * Desbloquear el audio con el primer gesto de la sesión, sea cual sea.
   *
   * No se le pide nada a nadie ni se muestra un "activa el sonido": el primer
   * clic en cualquier parte del CRM sirve, y para cuando llegue una llamada ya
   * hubo decenas. `once` porque con uno basta.
   */
  useEffect(() => {
    const desbloquear = () => void contextoTimbre()
    const opciones = { once: true, passive: true } as const

    window.addEventListener('pointerdown', desbloquear, opciones)
    window.addEventListener('keydown', desbloquear, opciones)

    return () => {
      window.removeEventListener('pointerdown', desbloquear)
      window.removeEventListener('keydown', desbloquear)
    }
  }, [])

  const llamar = useCallback(
    async (conversacionId: string, opciones?: { conVideo?: boolean; titulo?: string }): Promise<boolean> => {
      if (ocupado) return false
      setOcupado(true)
      try {
        const res = await fetch('/api/llamadas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversacion_id: conversacionId, con_video: opciones?.conVideo ?? false }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo llamar')

        const llamada = json.data.llamada as Llamada

        // Si uno se une a una que ya estaba, hay que marcarse presente: el POST
        // solo da de alta a quien la abre.
        if (json.data.yaExistia) {
          await fetch(`/api/llamadas/${llamada.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'entrar' }),
          })
        }

        setActiva({ llamada, titulo: opciones?.titulo ?? 'Llamada' })
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo iniciar la llamada')
        return false
      } finally {
        setOcupado(false)
      }
    },
    [ocupado],
  )

  const contestar = useCallback(async () => {
    if (!entrante) return
    pararTimbre()
    const llamada = entrante
    setEntrante(null)

    try {
      const res = await fetch(`/api/llamadas/${llamada.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'entrar' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo contestar')
      setActiva({ llamada, titulo: tituloDeLlamada(llamada) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo contestar')
    }
  }, [entrante, pararTimbre, tituloDeLlamada])

  /**
   * Unirse a una que ya estaba andando. Es el mismo POST que llamar: el endpoint
   * ve que hay una viva en ese hilo y devuelve esa en vez de abrir otra.
   */
  const unirse = useCallback(async () => {
    const llamada = enCurso
    if (!llamada) return
    setEnCurso(null)

    try {
      const res = await fetch('/api/llamadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: llamada.conversacion_id, con_video: llamada.con_video }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo entrar')
      const entrada = (json.data as { llamada: Llamada }).llamada
      setActiva({ llamada: entrada, titulo: tituloDeLlamada(entrada) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo entrar a la llamada')
    }
  }, [enCurso, tituloDeLlamada])

  const rechazar = useCallback(async () => {
    if (!entrante) return
    pararTimbre()
    const id = entrante.id
    setEntrante(null)
    await fetch(`/api/llamadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'rechazar' }),
    }).catch(() => {})
  }, [entrante, pararTimbre])

  // La entrante manda: si suena una mientras se ofrecía otra, se atiende la que
  // tiene a alguien esperando del otro lado.
  const enPantalla = entrante ?? enCurso
  const esEntrante = Boolean(entrante)
  const quien = enPantalla ? porId.get(enPantalla.iniciada_por) : null

  return (
    <Contexto.Provider
      value={{
        llamar,
        enLlamada: Boolean(activa),
        conversacionActiva: activa?.llamada.conversacion_id ?? null,
      }}
    >
      {children}

      {/* Timbre. Va sobre todo, incluso sobre la llamada en curso: alguien puede
          estar en una sala de voz y recibir una llamada directa. */}
      {enPantalla && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center p-4"
          style={{ background: 'oklch(0% 0 0 / 55%)', backdropFilter: 'blur(6px)' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="llamada-entrante-quien"
          aria-describedby="llamada-entrante-que"
        >
          <div
            className="w-full max-w-[380px] rounded-3xl px-6 py-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
          >
            <div className="flex flex-col items-center text-center">
              {/* El anillo late al ritmo del timbre. Es lo que hace que se lea
                  como "está sonando ahora" y no como un aviso de algo que ya
                  pasó -- que era el problema de la tarjeta en la esquina. */}
              <div className="relative">
                {/* El anillo late solo si esta sonando ahora. Para una llamada
                    que lleva rato andando seria una urgencia inventada. */}
                {esEntrante && (
                  <span
                    className="absolute -inset-2 rounded-full animate-ping"
                    style={{ background: 'oklch(62% 0.17 150 / 25%)' }}
                    aria-hidden
                  />
                )}
                <span className="relative block rounded-full">
                  <AvatarChat
                    nombre={quien?.nombre ?? 'Alguien'}
                    avatarUrl={quien?.avatar_url ?? null}
                    color={quien?.color ?? null}
                    size={88}
                  />
                </span>
              </div>

              <p
                id="llamada-entrante-quien"
                className="mt-5 text-[20px] font-semibold text-[var(--tx-ink-primary)] truncate max-w-full"
              >
                {quien?.nombre ?? 'Alguien'}
              </p>
              <p
                id="llamada-entrante-que"
                className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--tx-ink-muted)]"
              >
                {enPantalla.con_video ? <VideoIcon className="size-4" /> : <PhoneIcon className="size-4" />}
                {esEntrante
                  ? enPantalla.con_video
                    ? 'Videollamada entrante'
                    : 'Llamada entrante'
                  : 'Ya está en la llamada'}
              </p>
            </div>

            {/* Rechazar a la izquierda y contestar a la derecha, separados: es el
                orden de cualquier teléfono, y con los pulgares encima de la
                pantalla la distancia entre ambos es lo que evita colgarle a
                alguien por error. */}
            <div className="mt-7 flex gap-3">
              <button
                onClick={esEntrante ? rechazar : () => setEnCurso(null)}
                className="flex-1 inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 text-[13px] font-medium transition-transform active:scale-95"
                style={
                  esEntrante
                    ? { background: 'oklch(58% 0.19 25)', color: 'oklch(98% 0 0)' }
                    : { background: 'oklch(100% 0 0 / 8%)', color: 'var(--tx-ink-primary)' }
                }
              >
                {esEntrante ? <PhoneOffIcon className="size-5" /> : <XIcon className="size-5" />}
                {esEntrante ? 'Rechazar' : 'Ahora no'}
              </button>
              <button
                onClick={esEntrante ? contestar : unirse}
                autoFocus
                className="flex-1 inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 text-[13px] font-semibold transition-transform active:scale-95"
                style={{ background: 'oklch(62% 0.17 150)', color: 'oklch(15% 0.02 150)' }}
              >
                <PhoneIcon className="size-5" />
                {esEntrante ? 'Contestar' : 'Unirse'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activa && (
        <PanelLlamada
          llamadaId={activa.llamada.id}
          conversacionId={activa.llamada.conversacion_id}
          miIntegranteId={miIntegranteId}
          conVideo={activa.llamada.con_video}
          titulo={activa.titulo}
          personas={equipo}
          onCerrar={() => setActiva(null)}
        />
      )}
    </Contexto.Provider>
  )
}
