'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Nombre único por montaje: supabase-js cachea canales por nombre. */
let contadorCanal = 0

/**
 * Quién está dentro de cada sala de voz. Se refresca con los cambios de `llamadas`,
 * no con un temporizador: un punto que aparece tarde manda a entrar a una sala vacía.
 */
export function useSalasVoz(): Map<string, string[]> {
  const [enSalas, setEnSalas] = useState<Map<string, string[]>>(() => new Map())

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch('/api/llamadas/activas')
      const json = await res.json()
      if (!json.success) return
      const mapa = new Map<string, string[]>()
      for (const fila of json.data as { llamada: { conversacion_id: string }; dentro: string[] }[]) {
        mapa.set(fila.llamada.conversacion_id, fila.dentro)
      }
      setEnSalas(mapa)
    } catch {
      // Sin esto solo se pierde el puntito de "hay gente"; entrar sigue andando.
    }
  }, [])

  useEffect(() => {
    // `refrescar` es async: aquí solo arranca el fetch; el setState ocurre al responder.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refrescar()
    const supabase = createClient()
    const canal = supabase
      .channel(`salas-vivas-${++contadorCanal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamada_participantes' }, () => void refrescar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamadas' }, () => void refrescar())
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [refrescar])

  return enSalas
}
