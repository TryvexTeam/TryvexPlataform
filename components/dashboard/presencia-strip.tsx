'use client'

/**
 * Fila de presencia del equipo — Client Component.
 *
 * Recibe todo por props (el llamador decide de dónde salen los datos: server,
 * realtime o ambos). No consulta nada por su cuenta.
 *
 * Scroll horizontal con scroll-snap: en móvil la fila no se recorta ni obliga a
 * que la página entera scrollee de lado. Nunca `overflow-hidden`.
 *
 * El estado se lee sin color: el label va escrito bajo el nombre.
 */

import type { EstadoPresencia } from '@/lib/types/presencia'
import { PRESENCIA_COLOR, PRESENCIA_LABEL } from '@/lib/types/presencia'

export interface PresenciaItem {
  nombre: string
  estado: EstadoPresencia
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase()
}

export default function PresenciaStrip({
  integrantes,
  titulo = 'Equipo ahora',
}: {
  integrantes: PresenciaItem[]
  titulo?: string
}) {
  const lista = integrantes ?? []

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)] mb-3">
        {titulo}
      </h3>

      {lista.length === 0 ? (
        <p className="text-sm text-[var(--tx-ink-secondary)]">Nadie del equipo está en turno.</p>
      ) : (
        <ul
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {lista.map((p, i) => {
            const color = PRESENCIA_COLOR[p.estado]
            const label = PRESENCIA_LABEL[p.estado]
            return (
              <li
                key={`${p.nombre}-${i}`}
                className="snap-start shrink-0 flex flex-col items-center gap-1.5 w-[76px] min-h-[44px]"
              >
                <span
                  className="relative flex size-11 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    background: `${color}26`,
                    border: `1px solid ${color}4D`,
                    color: 'var(--tx-ink-primary)',
                  }}
                >
                  {iniciales(p.nombre)}
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full"
                    style={{ background: color, border: '2px solid var(--tx-surface-1)' }}
                  />
                </span>
                <span className="w-full truncate text-center text-[12px] text-[var(--tx-ink-secondary)]">
                  {p.nombre}
                </span>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium max-w-full truncate"
                  style={{ background: `${color}26`, border: `1px solid ${color}4D`, color }}
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
