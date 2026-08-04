'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Mantiene la pantalla al día sin que nadie recargue.
 *
 * Escucha los cambios de las tablas que le importan a la vista y pide al server
 * que vuelva a renderizar. Trae además dos redes de seguridad, porque el tiempo
 * real falla callado: si una tabla no está publicada, el canal igual responde
 * SUBSCRIBED y no llega nunca un evento.
 *
 *   1. Al volver a la pestaña se refresca. Es el caso más común: el usuario se
 *      fue a otra ventana, algo cambió, y vuelve.
 *   2. Un repaso periódico mientras la pestaña está visible.
 *
 * Con la publicación sana los eventos llegan al instante y las redes casi nunca
 * disparan; sin ella, la app sigue sintiéndose viva.
 */
/** Sufijo incremental para que dos montajes nunca compartan canal. */
let contadorCanales = 0

export function useDatosVivos(tablas: string[], opciones?: { intervaloMs?: number }) {
  const router = useRouter()
  const intervaloMs = opciones?.intervaloMs ?? 45_000

  // Una ráfaga de cambios no debe pedir cinco renders seguidos.
  const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clave = tablas.join(',')

  useEffect(() => {
    const refrescar = () => {
      if (pendiente.current) clearTimeout(pendiente.current)
      pendiente.current = setTimeout(() => router.refresh(), 250)
    }

    const supabase = createClient()

    // Nombre único por montaje, y no `vivos-<tablas>`.
    //
    // supabase-js cachea los canales por nombre y `removeChannel` es asíncrono.
    // React monta el efecto, lo limpia y lo vuelve a montar: en la segunda vuelta
    // `channel()` devolvía el MISMO canal, ya suscrito, y agregarle un `.on()`
    // lanzaba "cannot add postgres_changes callbacks after subscribe()".
    // Ese error tumbaba la página entera — así se cayó /hoy.
    const canal = supabase.channel(`vivos-${clave}-${++contadorCanales}`)
    for (const tabla of clave.split(',')) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, refrescar)
    }
    canal.subscribe()

    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    // Solo con la pestaña a la vista: en segundo plano no vale la pena el viaje.
    const repaso = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervaloMs)

    return () => {
      if (pendiente.current) clearTimeout(pendiente.current)
      clearInterval(repaso)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      supabase.removeChannel(canal)
    }
  }, [router, clave, intervaloMs])
}
