'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface SenalEscritura {
  conversacion_id: string
  integrante_id: string
}

const EXPIRA_MS = 4_000
const THROTTLE_MS = 2_000

export function useEscribiendo(miIntegranteId: string) {
  const [porConversacion, setPorConversacion] = useState<Map<string, string>>(new Map())
  const canalRef = useRef<RealtimeChannel | null>(null)
  const ultimaEmision = useRef(new Map<string, number>())
  const expiraciones = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel('escribiendo-equipo')
      .on('broadcast', { event: 'escribiendo' }, ({ payload }: { payload: SenalEscritura }) => {
        if (payload.integrante_id === miIntegranteId) return
        setPorConversacion((previo) => new Map(previo).set(payload.conversacion_id, payload.integrante_id))
        const anterior = expiraciones.current.get(payload.conversacion_id)
        if (anterior) clearTimeout(anterior)
        expiraciones.current.set(
          payload.conversacion_id,
          setTimeout(() => {
            setPorConversacion((previo) => {
              const siguiente = new Map(previo)
              siguiente.delete(payload.conversacion_id)
              return siguiente
            })
          }, EXPIRA_MS),
        )
      })
      .subscribe()
    canalRef.current = canal
    const timers = expiraciones.current
    return () => {
      timers.forEach(clearTimeout)
      void supabase.removeChannel(canal)
      canalRef.current = null
    }
  }, [miIntegranteId])

  const emitir = useCallback((conversacionId: string) => {
    const ahora = Date.now()
    if (ahora - (ultimaEmision.current.get(conversacionId) ?? 0) < THROTTLE_MS) return
    ultimaEmision.current.set(conversacionId, ahora)
    void canalRef.current?.send({
      type: 'broadcast',
      event: 'escribiendo',
      payload: { conversacion_id: conversacionId, integrante_id: miIntegranteId },
    })
  }, [miIntegranteId])

  return { escribiendo: porConversacion, emitir }
}
