import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('resize', callback)
  return () => window.removeEventListener('resize', callback)
}

/**
 * true cuando el viewport es más angosto que `breakpoint` (px), actualizado en
 * vivo mientras cambia el tamaño de la ventana.
 *
 * useSyncExternalStore y no useState+useEffect, misma razón que
 * use-has-mounted: el lint del repo (react-hooks/set-state-in-effect) rechaza
 * el setState síncrono para sincronizar con algo externo. El servidor no
 * tiene `window`, así que el snapshot de servidor devuelve `false` — no
 * angosto — para no generar mismatch de hidratación; se corrige solo al
 * montar en el cliente.
 */
export function useIsNarrowViewport(breakpoint: number) {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth < breakpoint,
    () => false,
  )
}
