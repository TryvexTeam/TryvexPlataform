'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[root error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-3">
        <h1 className="text-lg font-bold">Algo salió mal</h1>
        <p className="text-sm text-white/60">
          Ocurrió un error inesperado. Intenta recargar; si persiste, avisa al equipo.
        </p>
        {error.digest && <p className="text-xs font-mono text-white/40">Ref: {error.digest}</p>}
        <button
          onClick={reset}
          className="self-start mt-1 px-4 py-2 rounded-lg bg-[#E8352A] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
