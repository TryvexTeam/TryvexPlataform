'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversacion, Mensaje, MiembroChat } from '@/lib/types/chat'
import { cantidadNoLeidosDesde, indicePrimerNoLeido } from '@/lib/chat/no-leidos'
import { toast } from '@/lib/toast'

export function useMensajesHilo(conversacion: Conversacion, miIntegranteId: string) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [miembros, setMiembros] = useState<MiembroChat[]>(conversacion.miembros)
  const [fijados, setFijados] = useState<Mensaje[]>([])
  const [cargando, setCargando] = useState(true)

  const [lecturaInicial] = useState(() =>
    conversacion.miembros.find((m) => m.integrante_id === miIntegranteId)?.ultimo_leido_at ??
      new Date().toISOString(),
  )
  const idsMensajesRef = useRef<Set<string>>(new Set())
  const refrescoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    idsMensajesRef.current = new Set(mensajes.map((m) => m.id))
  }, [mensajes])

  const marcarLeida = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    try {
      const res = await fetch(`/api/chat/conversaciones/${conversacion.id}/leer`, { method: 'POST' })
      if (!res.ok) return
      const ahora = new Date().toISOString()
      setMiembros((prev) =>
        prev.map((m) => (m.integrante_id === miIntegranteId ? { ...m, ultimo_leido_at: ahora } : m)),
      )
    } catch {
      // Silencioso: reintentará en el próximo evento o visibilidad
    }
  }, [conversacion.id, miIntegranteId])

  const cargarFijados = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/mensajes?conversacion=${conversacion.id}&fijados=1`)
      const json = await res.json()
      if (json.success) setFijados(json.data as Mensaje[])
    } catch {
      // Silencioso
    }
  }, [conversacion.id])

  const cargar = useCallback(
    async (silencioso = false) => {
      try {
        const res = await fetch(`/api/chat/mensajes?conversacion=${conversacion.id}`)
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudieron cargar los mensajes')
        setMensajes(json.data as Mensaje[])
        void marcarLeida()
      } catch (err) {
        if (!silencioso) {
          toast.error(err instanceof Error ? err.message : 'Error de red al cargar el chat')
        }
      } finally {
        if (!silencioso) setCargando(false)
      }
    },
    [conversacion.id, marcarLeida],
  )

  const refrescarCoalescido = useCallback(() => {
    if (refrescoTimer.current) clearTimeout(refrescoTimer.current)
    refrescoTimer.current = setTimeout(() => {
      void cargar(true)
    }, 250)
  }, [cargar])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
    void cargarFijados()
  }, [cargar, cargarFijados])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`hilo-mensajes-${conversacion.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          if (nuevo.hilo_padre) return
          setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]))
          if (nuevo.autor_id !== miIntegranteId) {
            refrescarCoalescido()
            void marcarLeida()
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const actualizado = payload.new as Mensaje
          setMensajes((prev) =>
            prev.map((m) => (m.id === actualizado.id ? { ...m, ...actualizado } : m)),
          )
          void cargarFijados()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversacion_miembros',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const act = payload.new as Pick<MiembroChat, 'integrante_id' | 'ultimo_leido_at'>
          setMiembros((prev) =>
            prev.map((m) => (m.integrante_id === act.integrante_id ? { ...m, ultimo_leido_at: act.ultimo_leido_at } : m)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensaje_reacciones' },
        (payload) => {
          const fila = payload.new as { mensaje_id: string }
          if (idsMensajesRef.current.has(fila.mensaje_id)) refrescarCoalescido()
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'mensaje_reacciones' },
        (payload) => {
          const fila = payload.old as { mensaje_id?: string }
          if (fila.mensaje_id && idsMensajesRef.current.has(fila.mensaje_id)) refrescarCoalescido()
        },
      )
      .subscribe()

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void marcarLeida()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      if (refrescoTimer.current) clearTimeout(refrescoTimer.current)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      void supabase.removeChannel(canal)
    }
  }, [conversacion.id, miIntegranteId, marcarLeida, cargarFijados, refrescarCoalescido])

  const primerNoLeido = useMemo(
    () => indicePrimerNoLeido(mensajes, lecturaInicial, miIntegranteId),
    [mensajes, miIntegranteId, lecturaInicial],
  )
  const noLeidosIniciales = cantidadNoLeidosDesde(mensajes, primerNoLeido)

  return {
    mensajes,
    setMensajes,
    miembros,
    fijados,
    setFijados,
    cargando,
    primerNoLeido,
    noLeidosIniciales,
    recargar: cargar,
    recargarFijados: cargarFijados,
    marcarLeida,
  }
}
