'use client'

import { textoPlano } from '@/lib/markdown/mini'
import type { Mensaje, MiembroChat } from '@/lib/types/chat'

interface CitaMensajeProps {
  citado: Mensaje | undefined
  autor: MiembroChat | undefined
  onIr?: () => void
  /** false en la barra de "respondiendo a": ahí hay espacio y conviene leer todo antes de enviar. */
  recortar?: boolean
}

/**
 * El mensaje al que se responde, arriba de la respuesta.
 *
 * Va recortado y en texto plano: es una referencia para ubicarse, no una segunda
 * lectura. Con el markdown renderizado adentro, la cita competiría visualmente
 * con el mensaje que la contiene.
 */
export function CitaMensaje({ citado, autor, onIr, recortar = true }: CitaMensajeProps) {
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
      {recortar ? (
        <span className="block text-[12px] opacity-70 line-clamp-2">{texto}</span>
      ) : (
        // Un mensaje citado puede ser mucho más largo que el alto disponible en la
        // barra de "respondiendo a": en vez de empujar el composer entero hacia
        // abajo, se limita el alto y se deja scrollear adentro.
        <span className="block max-h-24 overflow-y-auto text-[12px] opacity-70 whitespace-pre-wrap">{texto}</span>
      )}
    </button>
  )
}
