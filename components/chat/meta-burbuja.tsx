'use client'

import { AlertCircleIcon, CheckCheckIcon, CheckIcon, Clock3Icon } from 'lucide-react'
import type { EstadoTick } from '@/lib/chat/ticks'

interface MetaBurbujaProps {
  estado?: EstadoTick
  hora?: string
  editado?: boolean
  onReintentar?: () => void
  soloTick?: boolean
}

export function MetaBurbuja({ estado, hora, editado, onReintentar, soloTick }: MetaBurbujaProps) {
  const icono = <Tick estado={estado} />
  if (soloTick) return <span className="mr-1 inline-flex align-[-2px]">{icono}</span>
  const ancho = estado === 'fallido' ? '8.5rem' : editado ? '7.5rem' : '5rem'
  return (
    <>
      <span className="chat-meta-spacer" style={{ width: ancho }} aria-hidden />
      <span className="chat-bubble-meta">
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
