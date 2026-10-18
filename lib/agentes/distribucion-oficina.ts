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

/** Espacio de la sala alrededor de los escritorios. */
const COSTADO = 3.8
const FONDO_PANTALLA = 4.4
const FRENTE = 3.6
/** A qué distancia de la pantalla se paran a mirarla. */
const DISTANCIA_A_PANTALLA = 1.9
/** Dónde se sienta el agente, respecto del centro de su escritorio. */
export const ASIENTO: [number, number] = [0, -0.5]

/**
 * La sala completa. Al fondo, al centro, la pantalla grande de la Cola: es lo
 * que todos miran. A los costados, el conocimiento y WhatsApp; adelante, las
 * directivas. Sin muros: una isla abierta.
 */
export function distribuirConZonas(n: number): Distribucion & { zonas: Record<ZonaOficina, [number, number]> } {
  const base = distribuirOficina(n)
  const [ancho, fondo] = base.sala
  return {
    puestos: base.puestos,
    sala: [ancho + COSTADO * 2, fondo + FONDO_PANTALLA + FRENTE],
    zonas: {
      // La "zona" de la Cola es la pantalla.
      cola: [0, -(fondo / 2 + FONDO_PANTALLA * 0.62)],
      conocimiento: [-(ancho / 2 + COSTADO * 0.52), -0.4],
      whatsapp: [ancho / 2 + COSTADO * 0.52, -0.4],
      directivas: [0, fondo / 2 + FRENTE * 0.55],
    },
  }
}

/** Dónde se para cada agente a mirar la pantalla: repartidos frente a ella. */
export function lugarFrenteAPantalla(i: number, n: number, pantalla: [number, number], anchoPantalla: number): [number, number] {
  const hueco = Math.min(0.95, (anchoPantalla - 1) / Math.max(n, 1))
  const x = pantalla[0] + (i - (n - 1) / 2) * hueco
  return [x, pantalla[1] + DISTANCIA_A_PANTALLA]
}

/**
 * El camino del escritorio a la pantalla, por el pasillo: se levanta, sale
 * hacia el pasillo de su derecha, camina por él hasta la altura de la
 * pantalla, y de ahí a su lugar. Así no atraviesa ningún escritorio.
 */
export function rutaAPantalla(puesto: [number, number], destino: [number, number]): Array<[number, number]> {
  const asiento: [number, number] = [puesto[0] + ASIENTO[0], puesto[1] + ASIENTO[1]]
  const pasillo = puesto[0] + SEPARACION_X / 2
  return [asiento, [pasillo, asiento[1]], [pasillo, destino[1]], destino]
}
