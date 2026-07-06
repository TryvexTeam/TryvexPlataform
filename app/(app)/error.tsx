'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error boundary]', error)
  }, [error])

  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <div
        className="max-w-md w-full rounded-2xl border border-white/[0.08] p-6 flex flex-col items-start gap-3"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'color-mix(in oklab, var(--tx-accent) 15%, transparent)',
              border: '1px solid color-mix(in oklab, var(--tx-accent) 25%, transparent)',
              color: 'var(--tx-accent)',
            }}
          >
            <AlertTriangle size={17} />
          </span>
          <h1 className="text-[16px] font-bold" style={{ color: 'var(--tx-ink-primary)' }}>
            Algo salió mal
          </h1>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--tx-ink-muted)' }}>
          No pudimos cargar esta sección. Puede ser un problema de conexión con la base de datos.
          Intenta de nuevo; si persiste, avisa al equipo.
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono" style={{ color: 'var(--tx-ink-muted)' }}>
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-[10px] text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--tx-accent)', boxShadow: '0 8px 22px var(--tx-accent-glow)' }}
        >
          <RotateCw size={13} />
          Reintentar
        </button>
      </div>
    </div>
  )
}
