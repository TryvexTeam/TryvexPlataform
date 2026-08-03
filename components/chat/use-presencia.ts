'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Quién está conectado ahora mismo. Va por Realtime Presence: es estado en
 * memoria del canal, no una tabla — nadie queda "en línea" para siempre si se
 * le corta la luz.
 */
export function usePresencia(miIntegranteId: string): Set<string> {
  const [enLinea, setEnLinea] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!miIntegranteId) return

    const supabase = createClient()
    const canal = supabase.channel('presencia-equipo', {
      config: { presence: { key: miIntegranteId } },
    })

    const sincronizar = () => {
      const estado = canal.presenceState()
      setEnLinea(new Set(Object.keys(estado)))
    }

    canal
      .on('presence', { event: 'sync' }, sincronizar)
      .on('presence', { event: 'join' }, sincronizar)
      .on('presence', { event: 'leave' }, sincronizar)
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') canal.track({ desde: new Date().toISOString() })
      })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [miIntegranteId])

  return enLinea
}
