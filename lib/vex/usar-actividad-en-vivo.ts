'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ActividadAgente } from '@/lib/types/sala-agentes'

/**
 * La actividad de cada agente (qué herramienta usa ahora), escuchando la base.
 *
 * No usa el refresco general de Intelligence a propósito: el hook de Claude
 * Code avisa varias veces por minuto, y recargar la página entera en cada
 * herramienta sería carísimo. Acá solo cambia el panel del agente.
 */
export function useActividadEnVivo(inicial: Record<string, ActividadAgente | null>): Record<string, ActividadAgente | null> {
  const [actividad, setActividad] = useState(inicial)
  const [base, setBase] = useState(inicial)

  // Cuando el servidor manda datos nuevos (una recarga normal), mandan ellos.
  if (base !== inicial) {
    setBase(inicial)
    setActividad(inicial)
  }

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel('oficina-actividad')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agente_actividad' }, (cambio) => {
        const f = cambio.new as {
          agente_id?: string
          herramienta: string | null
          herramienta_at: string | null
          turno_desde: string | null
          herramientas_turno: number
        }
        if (!f?.agente_id) return
        const id = f.agente_id
        setActividad((previa) => ({
          ...previa,
          [id]: {
            herramienta: f.herramienta,
            herramientaAt: f.herramienta_at,
            turnoDesde: f.turno_desde,
            herramientasTurno: f.herramientas_turno ?? 0,
          },
        }))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [])

  return actividad
}
