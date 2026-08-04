'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PresenciaIntegrante } from '@/lib/types/presencia'

// Nombre único por montaje: supabase-js cachea los canales por nombre y
// removeChannel es asíncrono, así que un remonte reusaba uno ya suscrito y
// agregarle callbacks lanzaba un error que tumbaba la página.
let contadorCanales = 0

/**
 * Disponibilidad real del equipo: turno marcado + calendario.
 *
 * Se recarga cuando cambia una jornada o una reunión, así marcar la entrada se
 * ve al instante en el chat sin que nadie recargue. El repaso por reloj existe
 * porque hay un caso que ningún evento avisa: una reunión que **termina** sola
 * al llegar su hora. No hay INSERT ni UPDATE ahí — simplemente pasó el tiempo.
 */
export function useDisponibilidad(): Map<string, PresenciaIntegrante> {
  const [porIntegrante, setPorIntegrante] = useState<Map<string, PresenciaIntegrante>>(new Map())

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      try {
        const res = await fetch('/api/presencia')
        const json = await res.json()
        if (!vigente || !json.success) return
        setPorIntegrante(new Map((json.data as PresenciaIntegrante[]).map((p) => [p.integrante_id, p])))
      } catch {
        // Silencioso a propósito: la presencia es adorno, no puede romper el chat.
      }
    }

    cargar()

    const supabase = createClient()
    const canal = supabase
      .channel(`disponibilidad-equipo-${++contadorCanales}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jornadas' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reuniones' }, cargar)
      .subscribe()

    const reloj = setInterval(() => {
      if (document.visibilityState === 'visible') cargar()
    }, 60_000)

    return () => {
      vigente = false
      clearInterval(reloj)
      supabase.removeChannel(canal)
    }
  }, [])

  return porIntegrante
}
