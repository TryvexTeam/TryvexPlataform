import { useSyncExternalStore } from 'react'

/**
 * `useSyncExternalStore` y no `useState`+`useEffect`: el lint del repo
 * (`react-hooks/set-state-in-effect`) rechaza el `setState` síncrono dentro
 * de un efecto que necesitaría ese patrón para el flag de "ya montó en el
 * cliente". No hay nada a lo que suscribirse — el valor solo cambia una vez,
 * de servidor a cliente — así que la función de suscripción es un no-op.
 *
 * Usar para gatear cualquier valor derivado de `localStorage`/`window` que
 * se pinte directo en el JSX: sin esto, el servidor renderiza el default y
 * el cliente hidrata con el valor real, generando mismatch de hidratación.
 */
export function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}
