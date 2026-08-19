'use client'

import type { VistaDashboard } from '@/lib/types/dashboard'

interface VistaSelectorProps {
  vista: VistaDashboard
  onChange: (vista: VistaDashboard) => void
  /** Sin permiso `ver_jornadas_equipo` la opción Equipo ni se ofrece. */
  veEquipo: boolean
}

const OPCIONES: { id: VistaDashboard; label: string }[] = [
  { id: 'loMio', label: 'Lo mío' },
  { id: 'equipo', label: 'Equipo' },
]

/**
 * Segmented "Lo mío / Equipo".
 *
 * Botones reales (no divs con onClick) para heredar foco y teclado, y
 * `aria-current` en la activa: el color no puede ser el único canal.
 *
 * La activa va en blanco, no en acento: el rojo está reservado para la acción
 * siguiente del día. Un selector de vista no compite con eso.
 */
export function VistaSelector({ vista, onChange, veEquipo }: VistaSelectorProps) {
  const opciones = veEquipo ? OPCIONES : OPCIONES.filter((o) => o.id === 'loMio')
  if (opciones.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Cambiar vista del panel"
      className="inline-flex gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1"
    >
      {opciones.map((opcion) => {
        const activa = opcion.id === vista
        return (
          <button
            key={opcion.id}
            type="button"
            onClick={() => onChange(opcion.id)}
            aria-current={activa ? 'page' : undefined}
            className={`min-h-[44px] rounded-full px-5 text-[13px] font-medium transition-colors ${
              activa
                ? 'bg-white text-[var(--tx-bg-primary)]'
                : 'text-[var(--tx-ink-secondary)] hover:text-[var(--tx-ink-primary)]'
            }`}
          >
            {opcion.label}
          </button>
        )
      })}
    </div>
  )
}
