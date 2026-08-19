'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangleIcon } from 'lucide-react'

interface EstadoErrorProps {
  /** Qué falló, en concreto. Nada de "algo salió mal". */
  mensaje: string
}

/**
 * Error de un tile. Reintenta con `router.refresh()` (el dato lo arma el server),
 * y no tumba el resto del deck: cada sección lo pinta por su cuenta.
 */
export function EstadoError({ mensaje }: EstadoErrorProps) {
  const router = useRouter()

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-[28px] px-5 py-5"
      style={{ background: 'oklch(63% 0.21 22 / 6%)', border: '1px solid oklch(63% 0.21 22 / 28%)' }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon aria-hidden className="size-4" style={{ color: 'var(--tx-error)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>
          No se pudo cargar este dato
        </p>
      </div>
      <p className="text-sm" style={{ color: 'var(--tx-ink-secondary)' }}>{mensaje}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
        style={{ background: 'var(--tx-accent-subtle)', color: 'var(--tx-accent)' }}
      >
        Reintentar
      </button>
    </div>
  )
}
