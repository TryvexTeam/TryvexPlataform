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
   * El timbre se sintetiza en vez de cargar un mp3: son dos tonos alternados,
   * pesa cero y no hay un archivo más que servir. Si el navegador lo bloquea por
   * no haber gesto previo del usuario, no pasa nada: la notificación push y la
   * tarjeta en pantalla siguen avisando.
   */
  const sonar = useCallback(() => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()

      // Sin un gesto previo del usuario el navegador crea el contexto en pausa.
      // Sin este `resume` el timbre existe y no suena -- que es peor que no
      // tenerlo, porque uno cree que está avisando.
      void ctx.resume().catch(() => {})

      const ganancia = ctx.createGain()
      ganancia.gain.value = 0.14
      ganancia.connect(ctx.destination)

      let vivo = true

      /**
       * La cadencia del teléfono: dos tonos cortos, silencio, y otra vez. Se
       * repite hasta que se conteste o se rechace -- no se rinde a los tres
       * intentos. Una llamada directa a la que nadie llega es una llamada
       * perdida; si el timbre se apaga solo, ni siquiera es eso.
       */
      const pulso = () => {
        if (!vivo) return
        for (const [i, hz] of [880, 660, 880, 660].entries()) {
          const osc = ctx.createOscillator()
          const env = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = hz

          const t = ctx.currentTime + i * 0.32
          // Envolvente: el tono entra y sale suave. Un cuadrado seco suena a
          // error del sistema, no a teléfono.
          env.gain.setValueAtTime(0, t)
          env.gain.linearRampToValueAtTime(1, t + 0.02)
          env.gain.setValueAtTime(1, t + 0.22)
          env.gain.linearRampToValueAtTime(0, t + 0.28)

          osc.connect(env)
          env.connect(ganancia)
          osc.start(t)
          osc.stop(t + 0.3)
        }

        // En el teléfono la vibración llega donde el sonido no: con el aparato
        // en silencio, es lo único que avisa.
        if ('vibrate' in navigator) navigator.vibrate([300, 150, 300, 900])
      }

      pulso()
      const id = window.setInterval(pulso, 2600)

      timbre.current = {
        ctx,
        parar: () => {
          vivo = false
          window.clearInterval(id)
          if ('vibrate' in navigator) navigator.vibrate(0)
          void ctx.close()
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
          className="fixed inset-x-3 top-3 md:inset-x-auto md:right-6 md:top-6 md:w-[340px] z-[90] rounded-2xl p-4 shadow-2xl"
          style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
          role="alertdialog"
          aria-label="Llamada entrante"
        >
          <div className="flex items-center gap-3">
            <AvatarChat
              nombre={quien?.nombre ?? 'Alguien'}
              avatarUrl={quien?.avatar_url ?? null}
              color={quien?.color ?? null}
              size={48}
            />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[var(--tx-ink-primary)] truncate">
                {quien?.nombre ?? 'Alguien'}
              </p>
              <p className="flex items-center gap-1.5 text-[12px] text-[var(--tx-ink-muted)]">
                {entrante.con_video ? <VideoIcon className="size-3.5" /> : <PhoneIcon className="size-3.5" />}
                {entrante.con_video ? 'Videollamada entrante' : 'Llamada entrante'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={rechazar}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-medium"
              style={{ background: 'oklch(100% 0 0 / 6%)', color: 'var(--tx-ink-primary)' }}
            >
              <PhoneOffIcon className="size-4" />
              Rechazar
            </button>
            <button
              onClick={contestar}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold"
              style={{ background: 'oklch(62% 0.17 150)', color: 'oklch(15% 0.02 150)' }}
            >
              <PhoneIcon className="size-4" />
              Contestar
            </button>
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
