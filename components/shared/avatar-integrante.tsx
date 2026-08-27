'use client'

import { useState } from 'react'

/**
 * Avatar de un integrante: su foto de perfil, con las iniciales de respaldo.
 *
 * Las iniciales no son solo el estado de carga — son el estado final cuando no
 * hay foto o cuando la que hay no carga (enlace roto, permiso del bucket,
 * usuario sin conexión). Por eso van siempre en el DOM, debajo de la imagen:
 * si la foto falla, lo que queda es un avatar con letras, nunca un hueco.
 *
 * `<img>` y no `next/image` a propósito: las fotos viven en Supabase Storage y
 * `next.config.ts` no declara `remotePatterns`, así que el optimizador las
 * rechazaría. Es el mismo camino que ya usa `halo-avatar`.
 */

interface AvatarIntegranteProps {
  nombre: string
  avatarUrl?: string | null
  /** Color de perfil del integrante; tiñe el fondo de las iniciales. */
  color?: string | null
  /** Lado del círculo en píxeles. */
  size?: number
  /** Marca visible de "este eres tú": anillo de acento. */
  destacado?: boolean
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '·'
  )
}

export function AvatarIntegrante({
  nombre,
  avatarUrl,
  color,
  size = 36,
  destacado = false,
}: AvatarIntegranteProps) {
  const [fallo, setFallo] = useState(false)
  const muestraFoto = Boolean(avatarUrl) && !fallo

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border"
      style={{
        width: size,
        height: size,
        borderColor: destacado ? 'var(--tx-accent)' : 'rgba(255,255,255,.09)',
        // El color del perfil llega muy saturado para un fondo, así que entra
        // con transparencia: identifica sin competir con el texto encima.
        background: color ? `${color}26` : 'rgba(255,255,255,.06)',
      }}
      title={nombre}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-medium"
        style={{
          fontSize: size * 0.32,
          color: destacado ? 'var(--tx-accent-2)' : 'var(--tx-ink-secondary)',
        }}
      >
        {iniciales(nombre)}
      </span>

      {muestraFoto && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl ?? ''}
          alt={nombre}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFallo(true)}
          className="relative h-full w-full object-cover"
        />
      )}
    </div>
  )
}
