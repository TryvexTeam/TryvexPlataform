import Link from 'next/link'
import { InboxIcon } from 'lucide-react'

interface EstadoVacioProps {
  titulo: string
  /** Por qué está vacío y qué haría falta para que deje de estarlo. */
  descripcion: string
  ctaLabel?: string
  ctaHref?: string
}

/** Vacío por sección: nunca una celda en blanco (T-003 §9). */
export function EstadoVacio({ titulo, descripcion, ctaLabel, ctaHref }: EstadoVacioProps) {
  return (
    <div
      className="glass flex flex-col items-center justify-center gap-2 rounded-[28px] border border-dashed border-white/[0.10] px-4 py-10 text-center"
      style={{
        // Superficie propia, y NO solo `.glass`. El vidrio del sistema es un velo
        // blanco de 3.5% que se apoya entero en `backdrop-filter`, y medido en el
        // navegador de Cristian ese filtro devuelve `none`: sin él, la caja queda
        // transparente. Con un wallpaper de imagen detrás —el suyo tiene un
        // relámpago y ramas— el texto del estado vacío se leía encima del dibujo.
        //
        // El token va sólido a propósito: es lo único que garantiza contraste
        // esté o no el desenfoque, y sigue el tema si mañana cambia. El borde
        // punteado se conserva: es lo que distingue «vacío» de «con contenido».
        background: 'var(--tx-surface-1)',
      }}
    >
      <InboxIcon aria-hidden className="size-6" style={{ color: 'var(--tx-ink-muted)' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>{titulo}</p>
      <p className="text-sm" style={{ color: 'var(--tx-ink-secondary)' }}>{descripcion}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-1 inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
          style={{ background: 'var(--tx-accent-subtle)', color: 'var(--tx-accent-2)' }}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
