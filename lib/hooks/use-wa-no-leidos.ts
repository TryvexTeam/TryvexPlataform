'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Cuantos mensajes de WhatsApp sin leer tiene cada lead, para pintarlo en la
 * lista sin tener que abrir ficha por ficha.
 *
 * Se consulta cada 20 s y no cada 5 como el hilo abierto: esto es la vista de
 * fondo, no la conversacion que alguien esta mirando. Y se queda quieto cuando
 * la pestana no esta a la vista — un CRM que alguien dejo abierto toda la noche
 * no tiene por que seguir preguntando.
 */

const REFRESCO_MS = 20000

export function useWaNoLeidos(): {
  noLeidos: Record<string, number>
  refrescar: () => void
} {
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({})

  const refrescar = useCallback(async () => {
    try {
      const r = await fetch('/api/wa/no-leidos')
      if (!r.ok) return
      const d = await r.json()
      setNoLeidos(d.data ?? {})
    } catch {
      // Sin conexion se deja lo ultimo que se supo. Un contador viejo por unos
      // segundos es mejor que borrar los avisos de golpe y que parezca que no
      // hay nada pendiente.
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const tick = () => {
      if (!vivo || document.hidden) return
      refrescar()
    }

    tick()
    const t = setInterval(tick, REFRESCO_MS)
    // Al volver a la pestana se refresca al tiro, sin esperar los 20 s.
    document.addEventListener('visibilitychange', tick)

    return () => {
      vivo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refrescar])

  return { noLeidos, refrescar }
}
