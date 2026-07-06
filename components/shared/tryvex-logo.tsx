import { cn } from '@/lib/utils'

interface TryvexLogoProps {
  variant?: 'full' | 'icon'
  theme?: 'dark' | 'light'
  className?: string
  iconSize?: number
}

/* 4-pointed star recreated from the brand asset */
function SparkIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Main 4-pointed star — black */}
      <path
        d="M16 2C16 2 17.5 10.5 22 16C17.5 21.5 16 30 16 30C16 30 14.5 21.5 10 16C14.5 10.5 16 2 16 2Z"
        fill="currentColor"
      />
      <path
        d="M2 16C2 16 10.5 14.5 16 10C21.5 14.5 30 16 30 16C30 16 21.5 17.5 16 22C10.5 17.5 2 16 2 16Z"
        fill="currentColor"
      />
      {/* Small red spark — top right accent */}
      <path
        d="M23 5C23 5 23.7 8.3 25.5 10C23.7 11.7 23 15 23 15C23 15 22.3 11.7 20.5 10C22.3 8.3 23 5 23 5Z"
        fill="#E8352A"
      />
    </svg>
  )
}

export function TryvexLogo({ variant = 'full', theme = 'dark', className, iconSize = 20 }: TryvexLogoProps) {
  const isDark = theme === 'dark'

  if (variant === 'icon') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <SparkIcon size={iconSize} className={isDark ? 'text-white' : 'text-neutral-950'} />
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <SparkIcon size={iconSize} className={isDark ? 'text-white' : 'text-neutral-950'} />
      <span
        className={cn(
          'font-bold tracking-tight leading-none select-none',
          isDark ? 'text-white' : 'text-neutral-950'
        )}
        style={{ fontSize: iconSize * 0.9 }}
      >
        tryvex
        <span style={{ color: '#E8352A' }}>.</span>
      </span>
    </div>
  )
}
