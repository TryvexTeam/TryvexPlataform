import type { ReactNode } from 'react'

/**
 * Encabezado de sección del Panel de Mando.
 *
 * Título en caja alta y baja (no en versalitas gritadas), el conteo como
 * etiqueta a la derecha y espacio para acciones al final de la línea. Es lo
 * que da ritmo a la página sin meter una caja más.
 */

interface SeccionPanelProps {
  titulo: string
  /** Conteo o cualquier etiqueta corta al lado del título. */
  contador?: string
  /** El contador exige atención: se pinta en acento. */
  contadorAlerta?: boolean
  /** Filtros o acciones alineados a la derecha. */
  acciones?: ReactNode
  children: ReactNode
  /** Id del h2 para enlazar el `aria-labelledby` de la sección. */
  id: string
}

export function SeccionPanel({
  titulo,
  contador,
  contadorAlerta = false,
  acciones,
  children,
  id,
}: SeccionPanelProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id={id}
          className="text-[19px] font-medium tracking-[-0.02em] text-[var(--tx-ink-primary)]"
        >
          {titulo}
        </h2>

        {contador && (
          <span
            className="inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11.5px] font-medium"
            style={
              contadorAlerta
                ? { borderColor: 'rgba(232,53,42,.32)', color: 'var(--tx-accent-2)' }
                : { borderColor: 'rgba(255,255,255,.10)', color: 'var(--tx-ink-secondary)' }
            }
          >
            {contador}
          </span>
        )}

        {acciones && <div className="ml-auto flex items-center gap-2">{acciones}</div>}
      </div>

      {children}
    </section>
  )
}
