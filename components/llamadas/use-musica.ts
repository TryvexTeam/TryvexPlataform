'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  mandaAvanzar,
  salaVacia,
  type Comando,
  type ModoLoop,
  type Pista,
  type SalaMusica,
} from '@/lib/types/musica'

/**
 * Ver `use-datos-vivos`: supabase-js cachea los canales por nombre y
 * `removeChannel` es asíncrono. Sin este contador, remontar el componente
 * devolvía el MISMO canal ya suscrito y agregarle un `.on()` lanzaba
 * "cannot add postgres_changes callbacks after subscribe()", que tumba la página.
 */
let contadorCanal = 0

interface UseMusicaOpciones {
  conversacionId: string
  miIntegranteId: string
  /** Quiénes están en la llamada ahora. Decide quién avanza la cola. */
  presentes: string[]
}

export interface Musica {
  sala: SalaMusica
  cargando: boolean
  /** Lo último que respondió un comando: se muestra y se desvanece. */
  aviso: string | null
  limpiarAviso: () => void
  poner: (pista: Pista) => Promise<void>
  ejecutar: (comando: Comando, argumento?: Pista | ModoLoop) => Promise<string | null>
  /** La llamó el reproductor cuando llega al final de la pista. */
  alTerminar: () => Promise<void>
}

/**
 * El estado compartido de la música.
 *
 * No transporta audio: sincroniza un puntero (qué suena) y un reloj (desde
 * cuándo). Cada navegador reproduce lo mismo por su cuenta. Ver la migración 039
 * para el porqué de este modelo.
 */
export function useMusica({ conversacionId, miIntegranteId, presentes }: UseMusicaOpciones): Musica {
  const [sala, setSala] = useState<SalaMusica>(() => salaVacia(conversacionId))
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)

  // El avance de cola se dispara desde un callback del reproductor de YouTube,
  // que no se rearma en cada render. Sin refs leería la sala y los presentes de
  // la primera vuelta y decidiría con datos viejos.
  const salaRef = useRef(sala)
  const presentesRef = useRef(presentes)
  /** Evita que dos finales seguidos manden dos avances de la misma pista. */
  const avanzandoRef = useRef<string | null>(null)

  // Se sincronizan en un efecto y no en el cuerpo del componente: escribir un
  // ref durante el render rompe con el modo concurrente de React, que puede
  // renderizar y descartar sin llegar a montar nunca.
  useEffect(() => {
    salaRef.current = sala
    presentesRef.current = presentes
  }, [sala, presentes])

  useEffect(() => {
    let vigente = true

    fetch(`/api/musica?conversacion=${conversacionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return
        if (json.success) setSala(json.data as SalaMusica)
      })
      .catch(() => {})
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [conversacionId])

  useEffect(() => {
    const supabase = createClient()

    const canal = supabase
      .channel(`musica-${conversacionId}-${++contadorCanal}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sala_musica',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          // Un DELETE llega con `new` vacío. Ignorarlo y no vaciar la sala:
          // borrar la fila no es una operación que exista en la interfaz, y
          // reaccionar a ella apagaría la música de todos por un evento espurio.
          const fila = payload.new as Partial<SalaMusica>
          if (!fila?.conversacion_id) return
          setSala({ ...(fila as SalaMusica), cola: fila.cola ?? [], historial: fila.historial ?? [] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacionId])

  const ejecutar = useCallback(
    async (comando: Comando, argumento?: Pista | ModoLoop): Promise<string | null> => {
      try {
        const res = await fetch('/api/musica', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversacion_id: conversacionId, comando, argumento }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo')

        // La respuesta trae la sala ya escrita. Se aplica de inmediato en vez de
        // esperar el evento de Realtime: quien apretó el botón no debería ver un
        // retardo por el viaje de vuelta.
        setSala(json.data.sala as SalaMusica)
        setAviso(json.data.mensaje as string)
        return json.data.mensaje as string
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'Error con la música'
        setAviso(mensaje)
        return null
      }
    },
    [conversacionId],
  )

  const poner = useCallback(
    async (pista: Pista) => {
      await ejecutar('play', pista)
    },
    [ejecutar],
  )

  /**
   * La pista se acabó. Lo manda UN SOLO cliente.
   *
   * Los cinco navegadores llegan al final en el mismo segundo, así que si todos
   * avisaran, la cola saltaría cinco pistas de golpe. `mandaAvanzar` elige al del
   * UUID menor entre los presentes: es determinista, los cinco lo calculan igual
   * sin coordinarse, y si el encargado cierra la pestaña el siguiente pasa a
   * serlo solo, porque desaparece de la lista.
   */
  const alTerminar = useCallback(async () => {
    const actual = salaRef.current
    if (!actual.video_id) return
    if (!mandaAvanzar(miIntegranteId, presentesRef.current)) return
    if (avanzandoRef.current === actual.video_id) return

    avanzandoRef.current = actual.video_id
    try {
      const res = await fetch('/api/musica', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Se manda qué pista estaba terminando: si el servidor ya tiene otra, es
        // que alguien saltó mientras esto viajaba y el avance se descarta.
        body: JSON.stringify({ conversacion_id: conversacionId, video_id: actual.video_id }),
      })
      const json = await res.json()
      if (json.success) setSala(json.data.sala as SalaMusica)
    } catch {
      // Que falle el avance no debe romper la llamada: la música se queda quieta
      // y cualquiera puede saltar a mano.
    } finally {
      avanzandoRef.current = null
    }
  }, [conversacionId, miIntegranteId])

  const limpiarAviso = useCallback(() => setAviso(null), [])

  return { sala, cargando, aviso, limpiarAviso, poner, ejecutar, alTerminar }
}
