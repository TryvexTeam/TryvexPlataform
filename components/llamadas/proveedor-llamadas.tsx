'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { PhoneIcon, PhoneOffIcon, VideoIcon } from 'lucide-react'
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
  const [ocupado, setOcupado] = useState(false)

  const porId = new Map(equipo.map((p) => [p.id, p]))
  const timbre = useRef<{ ctx: AudioContext; parar: () => void } | null>(null)

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

  // ── Escuchar llamadas ─────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase.channel(`llamadas-de-${miIntegranteId}`)

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
        setActiva((previa) => (previa?.llamada.id === llamada.id ? null : previa))
      })
      .subscribe()

    return () => {
      pararTimbre()
      supabase.removeChannel(canal)
    }
  }, [miIntegranteId, pararTimbre, sonar])

  // Soltar el timbre si el componente muere con una llamada sonando.
  useEffect(() => () => pararTimbre(), [pararTimbre])

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

  const quien = entrante ? porId.get(entrante.iniciada_por) : null

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
      {entrante && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center p-4"
          style={{ background: 'oklch(0% 0 0 / 55%)', backdropFilter: 'blur(6px)' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="llamada-entrante-quien"
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
                <span
                  className="absolute -inset-2 rounded-full animate-ping"
                  style={{ background: 'oklch(62% 0.17 150 / 25%)' }}
                  aria-hidden
                />
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
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--tx-ink-muted)]">
                {entrante.con_video ? <VideoIcon className="size-4" /> : <PhoneIcon className="size-4" />}
                {entrante.con_video ? 'Videollamada entrante' : 'Llamada entrante'}
              </p>
            </div>

            {/* Rechazar a la izquierda y contestar a la derecha, separados: es el
                orden de cualquier teléfono, y con los pulgares encima de la
                pantalla la distancia entre ambos es lo que evita colgarle a
                alguien por error. */}
            <div className="mt-7 flex gap-3">
              <button
                onClick={rechazar}
                className="flex-1 inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 text-[13px] font-medium transition-transform active:scale-95"
                style={{ background: 'oklch(58% 0.19 25)', color: 'oklch(98% 0 0)' }}
              >
                <PhoneOffIcon className="size-5" />
                Rechazar
              </button>
              <button
                onClick={contestar}
                autoFocus
                className="flex-1 inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 text-[13px] font-semibold transition-transform active:scale-95"
                style={{ background: 'oklch(62% 0.17 150)', color: 'oklch(15% 0.02 150)' }}
              >
                <PhoneIcon className="size-5" />
                Contestar
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
