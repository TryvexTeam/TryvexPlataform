'use client'

import { useEffect, useState, type RefObject } from 'react'

export interface Grilla {
  ancho: number
  alto: number
  columnas: number
}

const PROPORCION = 16 / 9
const HUECO = 12

/**
 * El tamaño de cada recuadro, calculado como lo hacen Meet y Discord.
 *
 * La idea: no se elige un número de columnas de antemano. Se prueban todas las
 * repartidas posibles (1 columna, 2, 3…) y para cada una se calcula qué tamaño
 * tendría el recuadro respetando 16:9 **y cabiendo entero** en la caja. Gana la
 * que da el recuadro más grande. Por eso en Meet nunca hay que hacer scroll y la
 * última fila queda centrada.
 *
 * Lo anterior era `repeat(N, 1fr)` con altura libre: el ancho mandaba, la altura
 * salía de ahí, y con tres o más recuadros se desbordaba hacia abajo. Se veían
 * enormes porque cada uno ocupaba todo el ancho que le tocaba, sin mirar si
 * quedaba alto para dibujarlo.
 */
export function useGrillaVideo(
  contenedor: RefObject<HTMLElement | null>,
  cuantos: number,
): Grilla {
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 })

  // ResizeObserver y no un listener de `resize`: la caja también cambia cuando se
  // abre el chat al costado o cuando alguien entra a la llamada, y eso no dispara
  // un resize de la ventana.
  useEffect(() => {
    const el = contenedor.current
    if (!el) return

    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect
      setCaja({ ancho: width, alto: height })
    })

    observador.observe(el)
    return () => observador.disconnect()
  }, [contenedor])

  if (cuantos === 0 || caja.ancho === 0 || caja.alto === 0) {
    return { ancho: 0, alto: 0, columnas: 1 }
  }

  let mejor: Grilla = { ancho: 0, alto: 0, columnas: 1 }

  for (let columnas = 1; columnas <= cuantos; columnas++) {
    const filas = Math.ceil(cuantos / columnas)

    // Cuánto espacio le tocaría a cada recuadro en cada eje.
    const anchoDisponible = (caja.ancho - HUECO * (columnas - 1)) / columnas
    const altoDisponible = (caja.alto - HUECO * (filas - 1)) / filas

    // El recuadro tiene que caber en los dos. Manda el más apretado: si sobra
    // ancho pero falta alto, el que decide es el alto.
    const ancho = Math.min(anchoDisponible, altoDisponible * PROPORCION)
    const alto = ancho / PROPORCION

    if (ancho > 0 && alto > 0 && ancho * alto > mejor.ancho * mejor.alto) {
      mejor = { ancho, alto, columnas }
    }
  }

  return mejor
}
