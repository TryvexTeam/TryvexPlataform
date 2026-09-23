/**
 * Dónde va el escritorio de cada agente en la oficina 3D.
 *
 * Una grilla centrada en el origen: con pocos agentes, una fila; con más, se
 * reparte en filas parejas. El tamaño de la sala sale de la grilla, así la
 * oficina no queda con un piso enorme para dos escritorios ni con escritorios
 * cayéndose del borde cuando el equipo crece.
 */

export const SEPARACION_X = 3.4
export const SEPARACION_Z = 3.2
const MARGEN = 2.4

export interface Distribucion {
  /** [x, z] de cada escritorio, en el orden de los agentes. */
  puestos: Array<[number, number]>
  /** Ancho (x) y fondo (z) del piso. */
  sala: [number, number]
}

export function columnasPara(n: number): number {
  if (n <= 3) return Math.max(n, 1)
  return Math.ceil(Math.sqrt(n * 1.6))
}

export function distribuirOficina(n: number): Distribucion {
  const columnas = columnasPara(n)
  const filas = Math.max(1, Math.ceil(n / columnas))
  const puestos: Array<[number, number]> = []

  for (let i = 0; i < n; i++) {
    const fila = Math.floor(i / columnas)
    // La última fila, si va incompleta, se centra en vez de cargarse a un lado.
    const enEstaFila = fila === filas - 1 ? n - fila * columnas : columnas
    const col = i % columnas
    const x = (col - (enEstaFila - 1) / 2) * SEPARACION_X
    const z = (fila - (filas - 1) / 2) * SEPARACION_Z
    puestos.push([x, z])
  }

  return {
    puestos,
    sala: [columnas * SEPARACION_X + MARGEN, filas * SEPARACION_Z + MARGEN],
  }
}

export const ZONAS_OFICINA = ['cola', 'conocimiento', 'whatsapp', 'directivas'] as const
export type ZonaOficina = (typeof ZONAS_OFICINA)[number]

/** Cuánto espacio extra lleva la sala alrededor de los escritorios, para las zonas. */
const ANILLO_X = 3.4
const ANILLO_Z = 5

/**
 * La sala completa: escritorios al centro y una zona en cada esquina, como
 * las áreas de piso de una oficina. Atrás, el trabajo (la Cola) y el
 * conocimiento; adelante, lo de afuera (WhatsApp) y las reglas (Directivas).
 */
export function distribuirConZonas(n: number): Distribucion & { zonas: Record<ZonaOficina, [number, number]> } {
  const base = distribuirOficina(n)
  const [ancho, fondo] = base.sala
  const x = Math.max(ancho / 3, 3)
  const z = fondo / 2 + ANILLO_Z / 2 - 0.4
  return {
    puestos: base.puestos,
    sala: [ancho + ANILLO_X, fondo + ANILLO_Z * 2],
    zonas: {
      cola: [-x, -z],
      conocimiento: [x, -z],
      whatsapp: [-x, z],
      directivas: [x, z],
    },
  }
}
