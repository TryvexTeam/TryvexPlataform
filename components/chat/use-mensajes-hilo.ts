'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversacion, Mensaje, MiembroChat } from '@/lib/types/chat'
import { cantidadNoLeidosDesde, indicePrimerNoLeido } from '@/lib/chat/no-leidos'
import { toast } from '@/lib/toast'

export function useMensajesHilo(conversacion: Conversacion, miIntegranteId: string) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [miembros, setMiembros] = useState(conversacion.miembros)
  const [cargando, setCargando] = useState(true)
  const lecturaInicial = useRef(
    conversacion.miembros.find((m) => m.integrante_id === miIntegranteId)?.ultimo_leido_at ?? new Date().toISOString(),
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const marcarLeida = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    const respuesta = await fetch(`/api/chat/conversaciones/${conversacion.id}/leer`, { method: 'POST' })
    if (!respuesta.ok) return
    const ahora = new Date().toISOString()
    setMiembros((lista) => lista.map((m) => m.integrante_id === miIntegranteId ? { ...m, ultimo_leido_at: ahora } : m))
  }, [conversacion.id, miIntegranteId])

  const cargar = useCallback(async (silencioso = false) => {
    try {
      const respuesta = await fetch(`/api/chat/mensajes?conversacion=${conversacion.id}`)
      const json = await respuesta.json()
      if (!respuesta.ok || !json.success) throw new Error(json.error ?? 'No se pudieron cargar los mensajes')
      setMensajes(json.data as Mensaje[])
      await marcarLeida()
    } catch (error) {
      if (!silencioso) toast.error(error instanceof Error ? error.message : 'Error de red al cargar el chat')
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [conversacion.id, marcarLeida])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    const supabase = createClient()
    const recargar = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void cargar(true), 120)
    }
    const canal = supabase
      .channel(`hilo-whatsapp-${conversacion.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${conversacion.id}` }, recargar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversacion_miembros', filter: `conversacion_id=eq.${conversacion.id}` }, (payload) => {
        const actualizado = payload.new as Pick<MiembroChat, 'integrante_id' | 'ultimo_leido_at'>
        setMiembros((lista) => lista.map((m) => m.integrante_id === actualizado.integrante_id ? { ...m, ultimo_leido_at: actualizado.ultimo_leido_at } : m))
      })
      .subscribe()
    const visible = () => { if (document.visibilityState === 'visible') void marcarLeida() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', visible)
      void supabase.removeChannel(canal)
    }
  }, [cargar, conversacion.id, marcarLeida])

  const primerNoLeido = useMemo(
    () => indicePrimerNoLeido(mensajes, lecturaInicial.current, miIntegranteId),
    [mensajes, miIntegranteId],
  )
  const noLeidosIniciales = cantidadNoLeidosDesde(mensajes, primerNoLeido)

  return { mensajes, setMensajes, miembros, cargando, primerNoLeido, noLeidosIniciales, recargar: cargar }
}
