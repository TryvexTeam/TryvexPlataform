'use client'

import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Mensaje } from '@/lib/types/chat'
import { subirAdjuntos, leerJSON, type AdjuntoSubido } from '@/lib/chat/subir-adjuntos'

export interface DatosEnvio {
  contenido: string
  archivos: File[]
  responder_a?: string
}

interface UseEnvioProps {
  conversacionId: string
  miIntegranteId: string
  setMensajes: Dispatch<SetStateAction<Mensaje[]>>
  onEnviado?: (mensaje: Mensaje) => void
}

export function useEnvio({ conversacionId, miIntegranteId, setMensajes, onEnviado }: UseEnvioProps) {
  const [subiendo, setSubiendo] = useState<{ hechos: number; total: number } | null>(null)
  const pendientes = useRef(new Map<string, DatosEnvio>())

  const enviar = useCallback(async (datos: DatosEnvio, idExistente?: string) => {
    if (!datos.contenido.trim() && datos.archivos.length === 0) return false
    const localId = idExistente ?? `local-${crypto.randomUUID()}`
    pendientes.current.set(localId, datos)
    const optimista: Mensaje = {
      id: localId,
      conversacion_id: conversacionId,
      autor_id: miIntegranteId,
      contenido: datos.contenido.trim() || (datos.archivos.length ? 'Adjunto' : null),
      created_at: new Date().toISOString(),
      editado_at: null,
      eliminado_at: null,
      responder_a: datos.responder_a,
      envio_estado: 'pendiente',
    }
    setMensajes((lista) => idExistente
      ? lista.map((m) => m.id === localId ? optimista : m)
      : [...lista, optimista])

    try {
      let adjuntos: AdjuntoSubido[] = []
      if (datos.archivos.length) {
        setSubiendo({ hechos: 0, total: datos.archivos.length })
        adjuntos = await subirAdjuntos(conversacionId, datos.archivos, (hechos, total) => setSubiendo({ hechos, total }))
      }
      const respuesta = await fetch('/api/chat/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacion_id: conversacionId,
          contenido: datos.contenido.trim() || undefined,
          responder_a: datos.responder_a,
          adjuntos: adjuntos.length ? adjuntos : undefined,
        }),
      })
      const json = await leerJSON(respuesta)
      if (!respuesta.ok || !json?.success) throw new Error(json?.error ?? 'No se pudo enviar')
      const mensaje = json.data as Mensaje
      setMensajes((lista) => lista.map((m) => m.id === localId ? mensaje : m))
      pendientes.current.delete(localId)
      onEnviado?.(mensaje)
      return true
    } catch {
      setMensajes((lista) => lista.map((m) => m.id === localId ? { ...m, envio_estado: 'fallido' } : m))
      return false
    } finally {
      setSubiendo(null)
    }
  }, [conversacionId, miIntegranteId, onEnviado, setMensajes])

  const reintentar = useCallback((mensaje: Mensaje) => {
    const datos = pendientes.current.get(mensaje.id)
    if (datos) void enviar(datos, mensaje.id)
  }, [enviar])

  return { enviar, reintentar, subiendo }
}
