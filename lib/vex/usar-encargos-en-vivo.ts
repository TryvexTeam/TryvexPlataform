'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EncargoReal } from '@/lib/repos/intelligence-real'

/**
 * La cola de encargos, en vivo.
 *
 * El problema que resuelve: la sección mostraba datos escritos en el código, y
 * por eso no se enteraba de nada. Ahora el servidor entrega la cola en la
 * primera carga y esto la mantiene al día: cuando alguien encola algo desde su
 * celular, o un agente responde, la pantalla de los demás cambia sola.
 *
 * Por qué se suscribe y no se consulta cada X segundos: un sondeo cada 15
 * segundos son 5.760 consultas al día por cada pestaña abierta, y aun así llega
 * tarde. La suscripción no gasta nada mientras no pasa nada.
 *
 * Sobre la seguridad: Realtime respeta las mismas políticas que las consultas
 * normales, así que por este canal no llega nada que la persona no pudiera leer
 * igualmente. Y como los avisos pueden perderse si el navegador estuvo dormido,
 * al reconectar se vuelve a pedir la cola completa en vez de asumir que lo que
 * hay en memoria sigue siendo verdad.
 */

interface Opciones {
  /** La cola que resolvió el servidor. Es el punto de partida. */
  inicial: EncargoReal[]
  /** Vuelve a pedir la cola entera. Se usa al reconectar. */
  recargar: () => Promise<EncargoReal[]>
}

export interface ColaEnVivo {
  encargos: EncargoReal[]
  /** Si el canal está escuchando. En false, lo que se ve puede estar viejo. */
  enVivo: boolean
}

export function useEncargosEnVivo({ inicial, recargar }: Opciones): ColaEnVivo {
  const [encargos, setEncargos] = useState<EncargoReal[]>(inicial)
  const [enVivo, setEnVivo] = useState(false)

  // `recargar` suele venir como función nueva en cada render. Guardarla en una
  // ref evita que el canal se desuscriba y se vuelva a suscribir sin parar.
  const recargarRef = useRef(recargar)
  useEffect(() => {
    recargarRef.current = recargar
  })

  // Si el servidor entrega una cola distinta (tras una acción que revalida),
  // esa es la verdad: manda sobre lo que haya en memoria.
  const [inicialAnterior, setInicialAnterior] = useState(inicial)
  if (inicial !== inicialAnterior) {
    setInicialAnterior(inicial)
    setEncargos(inicial)
  }

  useEffect(() => {
    const supabase = createClient()
    let vivo = true

    const canal = supabase
      .channel('intelligence-encargos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agente_encargos' },
        () => {
          // El aviso dice que algo cambió, pero llega sin los nombres de quién
          // pidió y quién aprobó —esos salen de un join que Realtime no hace—.
          // Por eso se vuelve a pedir la cola en vez de parchear la fila: es un
          // viaje más, pero nunca muestra un encargo a medio armar.
          void recargarRef.current().then((frescos) => {
            if (vivo) setEncargos(frescos)
          })
        },
      )
      .subscribe((estado) => {
        if (!vivo) return

        if (estado === 'SUBSCRIBED') {
          setEnVivo(true)
          // Al (re)conectar puede haberse perdido algo mientras no escuchábamos.
          void recargarRef.current().then((frescos) => {
            if (vivo) setEncargos(frescos)
          })
          return
        }

        // CHANNEL_ERROR, TIMED_OUT o CLOSED: dejamos de estar al día, y la
        // pantalla tiene que poder decirlo en vez de aparentar que todo va bien.
        setEnVivo(false)
      })

    return () => {
      vivo = false
      void supabase.removeChannel(canal)
    }
  }, [])

  return { encargos, enVivo }
}
