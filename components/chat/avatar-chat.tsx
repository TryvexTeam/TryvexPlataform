'use client'

import { PRESENCIA_COLOR, PRESENCIA_LABEL, type EstadoPresencia } from '@/lib/types/presencia'

interface AvatarChatProps {
  nombre: string
  avatarUrl?: string | null
  color?: string | null
  /** Atajo para "disponible": equivale a estado="disponible". */
  enLinea?: boolean
  /** Disponibilidad real. Si viene, manda sobre `enLinea`. */
  estado?: EstadoPresencia
  size?: number
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Avatar con el punto de disponibilidad.
 *
 * El punto ya no es verde-o-nada: distingue disponible, en reunión y en pausa.
 * Fuera de turno no lleva punto — un gris permanente es ruido, no información.
 */
export function AvatarChat({ nombre, avatarUrl, color, enLinea = false, estado, size = 44 }: AvatarChatProps) {
  const punto = Math.max(10, Math.round(size * 0.28))
  const resuelto: EstadoPresencia | null = estado ?? (enLinea ? 'disponible' : null)
  const muestraPunto = resuelto !== null && resuelto !== 'fuera_de_turno' && resuelto !== 'inactivo'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={nombre}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full grid place-items-center font-semibold text-white"
          style={{
            width: size,
            height: size,
            background: color ?? 'linear-gradient(135deg,#FF8A5B,#8B5CF6)',
            fontSize: Math.round(size * 0.36),
          }}
          aria-hidden
        >
          {iniciales(nombre)}
        </div>
      )}

      {muestraPunto && resuelto && (
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: punto,
            height: punto,
            background: PRESENCIA_COLOR[resuelto],
            border: '2px solid var(--tx-bg-primary)',
          }}
          title={`${nombre} — ${PRESENCIA_LABEL[resuelto]}`}
        />
      )}
    </div>
  )
}
