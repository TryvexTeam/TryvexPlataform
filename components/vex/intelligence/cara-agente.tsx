'use client'

import { AvatarBot, type DefinicionAvatar } from './avatar-bot'
import strobi from '@/lib/vex/avatares/strobi.avatar.json'
import nova from '@/lib/vex/avatares/nova.avatar.json'
import freddy from '@/lib/vex/avatares/freddy.avatar.json'
import cubee from '@/lib/vex/avatares/cubee.avatar.json'
import cloudee from '@/lib/vex/avatares/cloudee.avatar.json'
import grokBot from '@/lib/vex/avatares/grok-bot.avatar.json'
import citrus from '@/lib/vex/avatares/citrus.avatar.json'
import kirby from '@/lib/vex/avatares/kirby.avatar.json'
import sunee from '@/lib/vex/avatares/sunee.avatar.json'
import onee from '@/lib/vex/avatares/onee.avatar.json'
import type { EstadoAgente } from '@/lib/types/sala-agentes'

/**
 * La cara de un agente: quién es y cómo está, en la misma pieza.
 *
 * Cada agente tiene SU bot, no una variante de color del mismo: forma propia y
 * paleta propia. Eso es lo que permite reconocerlos de reojo en una lista larga
 * —o en la tabla de encargos, donde el avatar mide 20 píxeles— sin leer el
 * nombre.
 *
 * El estado no se cuenta con un semáforo al lado: se ve en la mirada. Cada
 * estado corre una animación distinta de las 23 que trae la definición.
 */

const BOTS = {
  strobi,
  nova,
  freddy,
  cubee,
  cloudee,
  'grok-bot': grokBot,
  citrus,
  kirby,
  sunee,
  onee,
} as unknown as Record<string, DefinicionAvatar>

/**
 * Qué bot le toca a cada agente.
 *
 * Elegidos por carácter, no al azar: Vex es el rojo de la casa; Ariel, que
 * sostiene la infraestructura, es la cápsula serena; Spike, que rastrea datos,
 * es el redondo despierto; Emili recibe, y es el más amable del grupo. Jarvis
 * es el oscuro — decisión del señor Ignacio, y le calza: es el que coordina a
 * todos y el único que habla de igual a igual con él.
 */
const BOT_POR_AGENTE: Record<string, string> = {
  vex: 'cubee',
  ariel: 'nova',
  spike: 'strobi',
  emili: 'freddy',
  jarvis: 'grok-bot',
}

/** Si un agente nuevo no tiene bot asignado, se le da uno estable por nombre. */
const RESERVA = ['citrus', 'kirby', 'sunee', 'onee', 'cloudee']

const ANIMACION_POR_ESTADO: Record<EstadoAgente, string> = {
  trabajando: 'working',
  esperando_firma: 'suspicious',
  en_reposo: 'idle',
  sin_latido: 'sleeping',
}

interface CaraAgenteProps {
  nombre: string
  /**
   * Token de color del CRM. Solo se usa como respaldo: si el agente tiene bot
   * propio, manda la paleta del bot — para eso se eligió.
   */
  color: string
  estado: EstadoAgente
  /** Identificador del agente, para saber qué bot le toca. */
  agenteId?: string
  /** Lado del cuadro, en píxeles. */
  tamano?: number
}

export function CaraAgente({ nombre, color, estado, agenteId, tamano = 38 }: CaraAgenteProps) {
  const clave = agenteId ?? nombre.toLowerCase()
  const asignado = BOT_POR_AGENTE[clave] ?? reservaPara(clave)
  const definicion = BOTS[asignado] ?? BOTS.strobi

  return (
    <AvatarBot
      definicion={definicion}
      animacion={ANIMACION_POR_ESTADO[estado]}
      colorCuerpo={BOT_POR_AGENTE[clave] ? undefined : color}
      tamano={tamano}
      etiqueta={`${nombre}: ${etiqueta(estado)}`}
    />
  )
}

function reservaPara(clave: string): string {
  let suma = 0
  for (const letra of clave) suma += letra.charCodeAt(0)
  return RESERVA[suma % RESERVA.length]
}

function etiqueta(estado: EstadoAgente): string {
  if (estado === 'trabajando') return 'trabajando'
  if (estado === 'esperando_firma') return 'esperando tu firma'
  if (estado === 'en_reposo') return 'en reposo'
  return 'sin señales'
}
