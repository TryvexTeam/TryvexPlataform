'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversacion, Mensaje } from '@/lib/types/chat'
import { toast } from '@/lib/toast'

export function useConversaciones(iniciales: Conversacion[]) {
  const [conversaciones, setConversaciones] = useState(iniciales)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refrescar = useCallback(async () => {
    const respuesta = await fetch('/api/chat/conversaciones')
    const json = await respuesta.json()
    if (json.success) setConversaciones(json.data as Conversacion[])
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const programar = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void refrescar(), 180)
    }
    const canal = supabase
      .channel(`bandeja-chat-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, programar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversacion_miembros' }, programar)
      .subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      void supabase.removeChannel(canal)
    }
  }, [refrescar])

  const actualizar = useCallback(async (id: string, cuerpo: Record<string, unknown>) => {
    const respuesta = await fetch(`/api/chat/conversaciones/${id}/miembro`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const json = await respuesta.json()
    if (!respuesta.ok || !json.success) throw new Error(json.error ?? 'No se pudo actualizar')
    await refrescar()
  }, [refrescar])

  const preferencia = useCallback(async (id: string, cuerpo: Record<string, unknown>) => {
    try {
      await actualizar(id, cuerpo)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el chat')
    }
  }, [actualizar])

  const marcarLeida = useCallback(async (id: string) => {
    setConversaciones((lista) => lista.map((c) => c.id === id ? { ...c, no_leidos: 0 } : c))
    await fetch(`/api/chat/conversaciones/${id}/leer`, { method: 'POST' })
  }, [])

  const alEnviar = useCallback((mensaje: Mensaje) => {
    setConversaciones((lista) => lista
      .map((c) => c.id === mensaje.conversacion_id
        ? { ...c, ultimo_mensaje: mensaje, ultimo_mensaje_at: mensaje.created_at }
        : c)
      .sort((a, b) => b.ultimo_mensaje_at.localeCompare(a.ultimo_mensaje_at)))
  }, [])

  return { conversaciones, setConversaciones, refrescar, preferencia, marcarLeida, alEnviar }
}
