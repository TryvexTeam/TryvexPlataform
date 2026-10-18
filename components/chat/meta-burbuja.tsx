'use client'

import { AlertCircleIcon, CheckCheckIcon, CheckIcon, Clock3Icon } from 'lucide-react'
import type { EstadoTick } from '@/lib/chat/ticks'

interface MetaBurbujaProps {
  estado?: EstadoTick
  hora?: string
  editado?: boolean
  onReintentar?: () => void
  soloTick?: boolean
  /** Sin posición absoluta: para el solo-emoji, que no tiene burbuja. */
  estatico?: boolean
}

/** Espacio que el texto debe reservar al final para que la meta no se monte encima. */
export function anchoMeta(estado?: EstadoTick, editado?: boolean): string {
  if (estado === 'fallido') return '9.5rem'
  return editado ? '7rem' : estado ? '5rem' : '3.2rem'
}

export function MetaBurbuja({ estado, hora, editado, onReintentar, soloTick, estatico }: MetaBurbujaProps) {
  const icono = <Tick estado={estado} />
  if (soloTick) return <span className="mr-1 inline-flex align-[-2px]">{icono}</span>
  return (
    <>
      <span className="chat-bubble-meta" style={estatico ? { position: "static", justifyContent: "flex-end" } : undefined}>
        {editado ? <span>Editado</span> : null}<time>{hora}</time>{icono}
        {estado === 'fallido' && onReintentar ? <button onClick={onReintentar} className="font-semibold text-[var(--chat-error)] underline">Reintentar</button> : null}
      </span>
    </>
  )
}

function Tick({ estado }: { estado?: EstadoTick }) {
  if (!estado) return null
  if (estado === 'pendiente') return <Clock3Icon className="size-3.5" aria-label="Pendiente" />
  if (estado === 'fallido') return <AlertCircleIcon className="size-3.5 text-[var(--chat-error)]" aria-label="Falló" />
  if (estado === 'enviado') return <CheckIcon className="size-4" aria-label="Enviado" />
  return <CheckCheckIcon className={`size-4 ${estado === 'leido' ? 'text-[#53BDEB]' : ''}`} aria-label={estado === 'leido' ? 'Leído' : 'Entregado'} />
}
