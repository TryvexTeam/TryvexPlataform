'use client'

import { textoPlano } from '@/lib/markdown/mini'
import type { Mensaje, MiembroChat } from '@/lib/types/chat'

interface CitaMensajeProps {
  citado: Mensaje | undefined
  autor: MiembroChat | undefined
  onIr?: () => void
}

/**
 * El mensaje al que se responde, arriba de la respuesta.
 *
 * Va recortado y en texto plano: es una referencia para ubicarse, no una segunda
 * lectura. Con el markdown renderizado adentro, la cita competiría visualmente
 * con el mensaje que la contiene.
 */
export function CitaMensaje({ citado, autor, onIr }: CitaMensajeProps) {
  // El original pudo borrarse: la respuesta sigue siendo válida, pero conviene
  // decir que lo citado ya no está en vez de mostrar un hueco sin explicación.
  const texto = !citado
    ? 'Mensaje eliminado'
    : citado.contenido
      ? textoPlano(citado.contenido)
      : (citado.adjuntos?.length ?? 0) > 0
        ? '📎 Archivo'
        : 'Mensaje eliminado'

  return (
    <button
      onClick={onIr}
      disabled={!citado || !onIr}
      className="w-full text-left mb-1 pl-2 border-l-2 border-current/40 disabled:cursor-default hover:opacity-80 transition-opacity"
    >
      {autor && <span className="block text-[11px] font-medium opacity-80">{autor.nombre}</span>}
      <span className="block text-[12px] opacity-70 line-clamp-2">{texto}</span>
    </button>
  )
}
