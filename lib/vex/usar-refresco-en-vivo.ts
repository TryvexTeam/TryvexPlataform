'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Mantiene Intelligence al día sin recargar a mano.
 *
 * Las pantallas se arman en el servidor (así el token del agente de WhatsApp
 * nunca llega al navegador). Lo que hace esto es avisarle al servidor que vuelva
 * a armarlas cuando algo cambió:
 *
 *  · Cambios en la base → Realtime avisa → `router.refresh()`.
 *  · Lo que vive en el VPS (estado del número, gasto, dudas) no pasa por
 *    Supabase y no puede avisar solo: se vuelve a pedir cada 30 segundos, y
 *    SOLO con la pestaña visible. Una pestaña olvidada abierta toda la noche no
 *    tiene por qué consultar el VPS 2.880 veces.
 *
 * El rebote importa: cuando un agente responde, cambian varias filas en pocos
 * milisegundos (el encargo, su consumo, su latido). Sin rebote serían varias
 * recargas seguidas; con él, una sola.
 */

const TABLAS = [
  'agente_encargos',
  'agentes',
  'mensajes_wa',
  'agente_consumo',
  'agente_citas',
  'agente_rutinas',
  'campanas',
  'mejoras',
  'directivas',
] as const

const REBOTE_MS = 800
const SONDEO_VPS_MS = 30_000

export function useRefrescoEnVivo(): { enVivo: boolean } {
  const router = useRouter()
  const [enVivo, setEnVivo] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let vivo = true

    const refrescar = () => {
      if (temporizador.current) clearTimeout(temporizador.current)
      temporizador.current = setTimeout(() => {
        if (vivo) router.refresh()
      }, REBOTE_MS)
    }

    let canal = supabase.channel('intelligence-todo')
    for (const tabla of TABLAS) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, refrescar)
    }
    canal.subscribe((estado) => {
      if (!vivo) return
      // Solo SUBSCRIBED es "al día". Cualquier otro estado (error, timeout,
      // cerrado) se muestra como sin conexión en vez de aparentar frescura.
      setEnVivo(estado === 'SUBSCRIBED')
      // Al reconectar pudo haberse perdido algo mientras no escuchábamos.
      if (estado === 'SUBSCRIBED') refrescar()
    })

    const sondeo = setInterval(() => {
      if (document.visibilityState === 'visible') refrescar()
    }, SONDEO_VPS_MS)

    // Al volver a la pestaña después de un rato, lo que se ve está viejo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vivo = false
      clearInterval(sondeo)
      document.removeEventListener('visibilitychange', alVolver)
      if (temporizador.current) clearTimeout(temporizador.current)
      void supabase.removeChannel(canal)
    }
  }, [router])

  return { enVivo }
}
