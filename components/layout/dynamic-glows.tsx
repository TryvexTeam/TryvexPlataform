'use client'

import { useTheme } from '@/components/dashboard/theme-context'

function hexToRgba(hex: string, alpha: number) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function DynamicGlows() {
  const { theme } = useTheme()

  if (theme.glowMode === 'off') return null

  const intensity = theme.glowMode === 'cinematic'
    ? Math.min(1, theme.glowIntensity * 1.3)
    : theme.glowIntensity

  const primaryAlpha = 0.35 * intensity
  const secondaryAlpha = 0.22 * intensity
  const size = theme.glowMode === 'cinematic' ? 1.15 : 1

  return (
    <>
      {/* Primary glow — top center-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          width: `${1000 * size}px`,
          height: `${700 * size}px`,
          left: '18%',
          top: '12%',
          background: `radial-gradient(circle at center, ${hexToRgba(theme.glowColor, primaryAlpha)}, transparent 70%)`,
          filter: 'blur(120px)',
          zIndex: 0,
          transition: 'background 600ms ease, width 400ms ease, height 400ms ease',
        }}
      />
      {/* Secondary glow — bottom right */}
      {theme.glowColorSecondary !== '#000000' && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            width: `${700 * size}px`,
            height: `${500 * size}px`,
            right: '-10%',
            bottom: '-10%',
            background: `radial-gradient(circle at center, ${hexToRgba(theme.glowColorSecondary, secondaryAlpha)}, transparent 70%)`,
            filter: 'blur(120px)',
            zIndex: 0,
            transition: 'background 600ms ease',
          }}
        />
      )}
    </>
  )
}
