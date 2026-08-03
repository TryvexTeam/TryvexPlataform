'use client'

interface AvatarChatProps {
  nombre: string
  avatarUrl?: string | null
  color?: string | null
  enLinea?: boolean
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

/** Avatar con el punto verde de "activo", igual que en Instagram. */
export function AvatarChat({ nombre, avatarUrl, color, enLinea = false, size = 44 }: AvatarChatProps) {
  const punto = Math.max(10, Math.round(size * 0.28))

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

      {enLinea && (
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: punto,
            height: punto,
            background: 'oklch(72% 0.17 145)',
            border: '2px solid var(--tx-bg-primary)',
          }}
          title={`${nombre} está activo`}
        />
      )}
    </div>
  )
}
