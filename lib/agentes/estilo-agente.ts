/**
 * Los estilos de los agentes en la oficina: el traje va PINTADO en el cuerpo
 * del robot (como un juguete de vinilo con el diseño impreso), no como piezas
 * 3D encima. Es más liviano de dibujar, no se atraviesa al moverse, y un
 * estilo nuevo es solo un dibujo nuevo.
 *
 * Cada traje define además el color de cabeza, brazos, manos y piernas.
 */

export const TRAJES = ['liso', 'esmoquin', 'bata', 'poleron', 'overol'] as const
export type TrajeAgente = (typeof TRAJES)[number]

/** "color" = el color del agente. Cualquier otro valor es un hex fijo. */
type Tono = 'color' | `#${string}`

export interface DefinicionTraje {
  nombre: string
  cabeza: Tono
  brazos: Tono
  manos: Tono
  piernas: Tono
  pies: Tono | 'oscuro'
}

export const DEFINICION_TRAJE: Record<TrajeAgente, DefinicionTraje> = {
  liso: { nombre: 'Liso', cabeza: 'color', brazos: 'color', manos: 'color', piernas: 'color', pies: 'oscuro' },
  esmoquin: { nombre: 'Esmoquin', cabeza: '#f5f6f8', brazos: '#17181c', manos: '#fbfbfc', piernas: '#17181c', pies: '#0f1013' },
  bata: { nombre: 'Bata', cabeza: 'color', brazos: '#f4f6f9', manos: 'color', piernas: 'color', pies: 'oscuro' },
  poleron: { nombre: 'Polerón', cabeza: 'color', brazos: '#9aa1ad', manos: 'color', piernas: '#2c3444', pies: '#f2f3f5' },
  overol: { nombre: 'Overol', cabeza: 'color', brazos: 'color', manos: 'color', piernas: '#3b5b8c', pies: '#6b4a2e' },
}

export interface EstiloAgente {
  traje: TrajeAgente
}

/** El estilo que trae un agente sin elegir nada: Jarvis va de esmoquin. */
export function estiloPorDefecto(nombre: string): EstiloAgente {
  return { traje: nombre.trim().toLowerCase() === 'jarvis' ? 'esmoquin' : 'liso' }
}

/** Lo que venga de la base, validado; si no sirve, el de por defecto. */
export function leerEstilo(valor: unknown, nombre: string): EstiloAgente {
  const traje = (valor as { traje?: unknown } | null)?.traje
  return TRAJES.includes(traje as TrajeAgente) ? { traje: traje as TrajeAgente } : estiloPorDefecto(nombre)
}

/** Resuelve un tono del traje a un color concreto. */
export function tonoDe(tono: Tono, color: string): string {
  return tono === 'color' ? color : tono
}
