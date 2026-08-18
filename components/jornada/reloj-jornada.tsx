'use client'

import { useEffect, useState } from 'react'
import { LogInIcon, LogOutIcon, PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { type Jornada, enPausa, formatearDuracion, segundosTrabajados } from '@/lib/types/jornada'

type Accion = 'entrada' | 'salida' | 'pausa' | 'reanudar'

interface RelojJornadaProps {
  jornadaInicial: Jornada | null
  /** Compacto para la barra superior; completo para la página de jornada. */
  variante?: 'compacto' | 'completo'
}

export function RelojJornada({ jornadaInicial, variante = 'completo' }: RelojJornadaProps) {
  const [jornada, setJornada] = useState<Jornada | null>(jornadaInicial)
  const [ocupado, setOcupado] = useState(false)
  // El contador es derivado: el tick solo marca el paso del tiempo.
  const [tick, setTick] = useState(() => Date.now())

  const pausada = jornada ? enPausa(jornada) : false
  const segundos = jornada ? segundosTrabajados(jornada, new Date(tick)) : 0

  useEffect(() => {
    if (!jornada || jornada.salida_at) return
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [jornada])

  const marcar = async (accion: Accion) => {
    setOcupado(true)
    try {
      const res = await fetch('/api/jornadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo marcar')

      const actualizada = json.data as Jornada
      if (accion === 'salida') {
        setJornada(null)
        toast.success(`Jornada cerrada: ${formatearDuracion(segundosTrabajados(actualizada))}`)
      } else {
        setJornada(actualizada)
        toast.success(
          accion === 'entrada' ? 'Entrada registrada'
          : accion === 'pausa' ? 'En pausa'
          : 'De vuelta',
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al marcar')
    } finally {
      setOcupado(false)
    }
  }

  const compacto = variante === 'compacto'

  // Compacto (barra superior): sin cambios, solo el numero y los botones —
  // ahi no hay lugar para una tarjeta.
  if (compacto) {
    if (!jornada) {
      return (
        <Button size="sm" disabled={ocupado} onClick={() => marcar('entrada')}>
          <LogInIcon className="size-4" />
          Marcar entrada
        </Button>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <span
          className="tabular-nums font-semibold text-[13px]"
          style={{ color: pausada ? 'var(--tx-ink-muted)' : 'var(--tx-ink-primary)' }}
          title={pausada ? 'En pausa' : 'Jornada en curso'}
          // El servidor y el cliente calculan "ahora" en momentos distintos
          // (aunque sea por 1-2 segundos) -- es un reloj en vivo, ese
          // desfase es esperable y no un bug real. Sin esto React lo
          // marcaba como error de hidratacion en cada carga.
          suppressHydrationWarning
        >
          {formatearDuracion(segundos)}
        </span>
        <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => marcar(pausada ? 'reanudar' : 'pausa')}>
          {pausada ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        </Button>
        <Button size="sm" variant="destructive" disabled={ocupado} onClick={() => marcar('salida')}>
          <LogOutIcon className="size-4" />
        </Button>
      </div>
    )
  }

  // Completo (pagina de Jornada): el reloj es el motivo de la pagina, asi que
  // es la unica tarjeta con un halo del acento detras — el resto de la pagina
  // se queda quieto para que esto sea lo primero que se lea.
  const estadoColor = !jornada ? 'var(--tx-ink-muted)' : pausada ? 'var(--tx-warning)' : 'var(--tx-success)'
  const estadoLabel = !jornada ? 'Fuera de turno' : pausada ? 'En pausa' : 'Trabajando'

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 size-64 rounded-full pointer-events-none"
        style={{ background: 'var(--tx-accent-glow)', filter: 'blur(60px)', opacity: jornada && !pausada ? 0.5 : 0.15, transition: 'opacity 600ms ease' }}
      />

      <div className="relative flex items-center gap-2 mb-4">
        <span className="relative flex size-2">
          {jornada && !pausada && (
            <span
              className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
              style={{ background: estadoColor }}
            />
          )}
          <span className="relative inline-flex size-2 rounded-full" style={{ background: estadoColor }} />
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: estadoColor }}>
          {estadoLabel}
        </span>
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <span
          className="tabular-nums font-bold text-5xl sm:text-6xl leading-none"
          style={{ color: pausada ? 'var(--tx-ink-secondary)' : 'var(--tx-ink-primary)', letterSpacing: '-0.02em' }}
          // Ver comentario en la variante compacta: desfase esperable de un
          // reloj en vivo, no un bug de hidratacion real.
          suppressHydrationWarning
        >
          {jornada ? formatearDuracion(segundos) : '0h 00m'}
        </span>

        {!jornada ? (
          <Button size="lg" disabled={ocupado} onClick={() => marcar('entrada')}>
            <LogInIcon className="size-4" />
            Marcar entrada
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="lg" variant="secondary" disabled={ocupado} onClick={() => marcar(pausada ? 'reanudar' : 'pausa')}>
              {pausada ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              {pausada ? 'Reanudar' : 'Pausa'}
            </Button>
            <Button size="lg" variant="destructive" disabled={ocupado} onClick={() => marcar('salida')}>
              <LogOutIcon className="size-4" />
              Marcar salida
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
