'use client'

import { useSyncExternalStore } from 'react'

/**
 * La hora actual, para las pantallas que muestran cuánto lleva algo esperando.
 *
 * Tres problemas que este módulo resuelve de una vez, y por eso no es un
 * `Date.now()` suelto dentro del componente:
 *
 *  1. Leer la hora durante el render es impuro: el servidor y el navegador
 *     pintan números distintos y React avisa del desajuste de hidratación.
 *  2. Un contador congelado deja de ser una alarma. "espera 40 min" tiene que
 *     decir 41 al minuto siguiente, o nadie vuelve a creerle.
 *  3. Si cada tarjeta monta su propio `setInterval`, una bandeja con treinta
 *     traspasos monta treinta relojes que despiertan en momentos distintos.
 *
 * El nombre arranca con `use` porque la regla de hooks de React lo exige:
 * un hook que se llame `usarReloj` no lo reconoce el linter.
 *
 * Acá hay UN solo intervalo para toda la aplicación, que además se apaga solo
 * cuando nadie lo mira. En el servidor devuelve 0: quien lo use debe tratar el
 * 0 como "todavía no sé la hora" y no mostrar la espera, en vez de mostrarla
 * mal.
 */

const UN_MINUTO = 60_000

let valor = 0
let reloj: ReturnType<typeof setInterval> | null = null
const oyentes = new Set<() => void>()

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar)

  if (reloj === null) {
    valor = Date.now()
    reloj = setInterval(() => {
      valor = Date.now()
      for (const oyente of oyentes) oyente()
    }, UN_MINUTO)
  }

  // El primer suscriptor entra cuando `valor` acaba de dejar de ser 0: hay que
  // avisarle, o se queda con la foto del servidor hasta el próximo minuto.
  avisar()

  return () => {
    oyentes.delete(avisar)
    if (oyentes.size === 0 && reloj !== null) {
      clearInterval(reloj)
      reloj = null
    }
  }
}

/** El valor cacheado. React exige que no cambie entre llamadas sin aviso. */
function leer(): number {
  return valor
}

/** En el servidor no hay hora que valga: 0 significa "todavía no sé". */
function leerEnServidor(): number {
  return 0
}

export function useReloj(): number {
  return useSyncExternalStore(suscribir, leer, leerEnServidor)
}

/** Minutos transcurridos desde una fecha ISO. 0 si todavía no hay hora. */
export function minutosDesde(iso: string, ahora: number): number {
  if (ahora === 0) return 0
  return Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000))
}

/** "45 min", "3 h", "2 d". Para decir cuánto lleva algo esperando. */
export function espera(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h`
  return `${Math.floor(horas / 24)} d`
}
