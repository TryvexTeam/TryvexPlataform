'use client'

interface HaloAvatarProps {
  initials: string
  accent?: string
  size?: number
  ring?: boolean
  src?: string
  online?: boolean
}

export function HaloAvatar({
  initials,
  accent = '#A855F7',
  size = 32,
  ring = false,
  src,
  online = false,
}: HaloAvatarProps) {
  const bg =
    accent === 'gradient'
      ? 'linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%)'
      : `linear-gradient(135deg, ${accent}, ${accent}cc)`

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: src ? 'rgba(255,255,255,0.03)' : bg,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        boxShadow: ring
          ? '0 0 0 2px rgba(139,92,246,.35), 0 8px 20px rgba(0,0,0,.45)'
          : '0 6px 16px rgba(0,0,0,.45)',
        flexShrink: 0,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={initials}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      ) : (
        initials
      )}
      {online && (
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            borderRadius: '50%',
            background: '#22C55E',
            border: '2.5px solid #0f0f14',
            boxShadow: '0 0 10px rgba(34,197,94,0.6)',
          }}
        />
      )}
    </div>
  )
}

