import type { ReactNode } from 'react'

interface BentoGridProps {
  children: ReactNode
}

/**
 * Grilla presentacional del bento (T-003 §7): solo layout, los slots llegan
 * como children y cada uno declara sus propios `col-span` por breakpoint.
 *
 * Mapa exacto de columnas por ancho:
 * - 390px (base): 1 columna, gap-3 — todo apilado.
 * - 768px (md): 2 columnas, gap-4.
 * - 1024px (lg): 3 columnas.
 * - 1440px (xl): 4 columnas (el deck ya acota el ancho a max-w-[1400px]).
 *
 * `[&>*]:min-w-0` evita que un contenido ancho (texto largo sin cortes)
 * infle la celda y rompa la grilla. Sin `overflow-hidden`: si algo no cabe,
 * se deja que el flujo lo resuelva, nunca se recorta a escondidas.
 */
export function BentoGrid({ children }: BentoGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
      {children}
    </div>
  )
}
