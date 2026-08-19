'use client'

import { usePathname } from 'next/navigation'

/**
 * Entrada suave de cada página.
 *
 * La animación va en CSS y NO en `AnimatePresence`, y la diferencia no es de
 * estilo: es que la versión anterior dejaba páginas enteras invisibles.
 *
 * Con `<AnimatePresence mode="wait">` la entrada de la página nueva espera a
 * que la anterior termine de salir. Pero en el App Router el router desmonta
 * el contenido viejo y monta el nuevo por su cuenta, sin avisar a Framer
 * Motion: la salida nunca llega a ejecutarse, la entrada se queda esperándola
 * y el elemento nuevo se queda plantado en su estado inicial —`opacity: 0`—
 * con la página entera ya cargada debajo. Es un problema conocido del App
 * Router con Framer Motion (vercel/next.js#59349).
 *
 * Se notaba más al abrir un proyecto porque su contenido tarda más en llegar:
 * cuanto más se demora el servidor, más se desincroniza la animación. Recargar
 * funcionaba siempre, porque en una carga completa no hay página saliente que
 * esperar.
 *
 * En CSS no hay nada que orquestar. La animación arranca sola al montarse el
 * elemento y termina sola; si algo falla, el peor caso es que no se anime,
 * nunca que no se vea. Se pierde la animación de salida, que en el App Router
 * no llegaba a verse de todos modos.
 *
 * `key={pathname}` sigue ahí para que React monte un elemento nuevo en cada
 * ruta y la animación se repita.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="tx-page-enter h-full">
      {children}
    </div>
  )
}
