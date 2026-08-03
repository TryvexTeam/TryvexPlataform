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

  if (!jornada) {
    return (
      <Button size={compacto ? 'sm' : 'default'} disabled={ocupado} onClick={() => marcar('entrada')}>
        <LogInIcon className="size-4" />
        Marcar entrada
      </Button>
    )
  }

  return (
    <div className={`flex items-center ${compacto ? 'gap-2' : 'gap-3'}`}>
      <span
        className={`tabular-nums font-semibold ${compacto ? 'text-[13px]' : 'text-2xl'}`}
        style={{ color: pausada ? 'var(--tx-ink-muted)' : 'var(--tx-ink-primary)' }}
        title={pausada ? 'En pausa' : 'Jornada en curso'}
      >
        {formatearDuracion(segundos)}
      </span>

      <Button
        size={compacto ? 'sm' : 'default'}
        variant="secondary"
        disabled={ocupado}
        onClick={() => marcar(pausada ? 'reanudar' : 'pausa')}
      >
        {pausada ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        {compacto ? null : pausada ? 'Reanudar' : 'Pausa'}
      </Button>

      <Button size={compacto ? 'sm' : 'default'} variant="destructive" disabled={ocupado} onClick={() => marcar('salida')}>
        <LogOutIcon className="size-4" />
        {compacto ? null : 'Marcar salida'}
      </Button>
    </div>
  )
}
