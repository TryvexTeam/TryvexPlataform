'use client'

import { useEffect, useState } from 'react'

/** Por encima de esto se considera que la persona está hablando (0 a 255). */
const UMBRAL = 18

/**
 * Cuánto se mantiene encendido el borde después de que baja el volumen.
 *
 * Sin esta inercia el borde parpadea con cada pausa entre palabras, que es peor
 * que no tenerlo: la vista se va sola al recuadro que titila.
 */
const INERCIA_MS = 600

interface Fuente {
  id: string
  stream: MediaStream | null
}

/**
 * Quién está hablando en este momento, mirando el volumen de cada pista de audio.
 *
 * Es lo que hace que una llamada de cinco se entienda: sin esto hay que adivinar
 * de qué recuadro sale la voz. Meet y Discord lo resuelven igual, con un borde
 * que se enciende.
 *
 * Se mide en el navegador con un AnalyserNode, sin mandar nada por la red — el
 * dato ya está acá, el audio lo estamos reproduciendo de todos modos.
 */
export function useHablando(fuentes: Fuente[]): Set<string> {
  const [hablando, setHablando] = useState<Set<string>>(() => new Set())

  // La clave junta los ids con stream: así el efecto se rehace cuando entra o
  // sale alguien, pero no en cada render por tener un arreglo nuevo.
  const clave = fuentes
    .filter((f) => f.stream)
    .map((f) => f.id)
    .sort()
    .join(',')

  const hayAudio = fuentes.some((f) => f.stream && f.stream.getAudioTracks().length > 0)

  useEffect(() => {
    const conAudio = fuentes.filter((f) => f.stream && f.stream.getAudioTracks().length > 0)
    if (conAudio.length === 0) return

    let ctx: AudioContext
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
    } catch {
      // Sin AudioContext la llamada funciona igual, solo sin el borde.
      return
    }

    const analizadores = new Map<string, AnalyserNode>()
    // El parámetro de ArrayBuffer no es adorno: `getByteFrequencyData` no acepta
    // un Uint8Array que pudiera estar respaldado por un SharedArrayBuffer.
    const datos = new Map<string, Uint8Array<ArrayBuffer>>()
    const ultimaVez = new Map<string, number>()

    for (const f of conAudio) {
      try {
        const fuente = ctx.createMediaStreamSource(f.stream!)
        const analizador = ctx.createAnalyser()
        analizador.fftSize = 512
        // Suaviza el propio análisis; sumado a la inercia de abajo, el borde
        // acompaña la voz en vez de perseguir cada sílaba.
        analizador.smoothingTimeConstant = 0.6
        fuente.connect(analizador)
        analizadores.set(f.id, analizador)
        datos.set(f.id, new Uint8Array(new ArrayBuffer(analizador.frequencyBinCount)))
      } catch {
        // Un stream sin audio utilizable no debe tumbar al resto.
      }
    }

    let vivo = true

    // A 10 veces por segundo alcanza de sobra para que se vea instantáneo, y
    // cuesta mucho menos que atarlo a requestAnimationFrame (60 por segundo, en
    // un teléfono, mientras se decodifica video).
    const id = window.setInterval(() => {
      if (!vivo) return
      const ahora = Date.now()
      const activos = new Set<string>()

      for (const [quien, analizador] of analizadores) {
        const buffer = datos.get(quien)!
        analizador.getByteFrequencyData(buffer)

        let suma = 0
        for (const v of buffer) suma += v
        const promedio = suma / buffer.length

        if (promedio > UMBRAL) ultimaVez.set(quien, ahora)
        if (ahora - (ultimaVez.get(quien) ?? 0) < INERCIA_MS) activos.add(quien)
      }

      setHablando((previos) => {
        // Sin esta comparación se dispara un render 10 veces por segundo aunque
        // nadie hable, con cinco videos decodificándose al mismo tiempo.
        if (previos.size === activos.size && [...activos].every((x) => previos.has(x))) {
          return previos
        }
        return activos
      })
    }, 100)

    return () => {
      vivo = false
      window.clearInterval(id)
      void ctx.close()
    }
    // `fuentes` cambia de identidad en cada render; `clave` cambia solo cuando
    // entra o sale alguien, que es cuando hay que rearmar los analizadores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  // Sin nadie con audio no hay nada que decidir: se devuelve vacío directo en
  // vez de sincronizarlo con setState en el efecto de arriba, que es lo que
  // disparaba el render en cascada.
  return hayAudio ? hablando : new Set()
}
