import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { AsignacionConIntegrante } from '@/lib/types/asignacion'
import { getInitials } from '@/lib/utils/lead-utils'

/** Etiqueta humana del rol, para el title/aria-label de cada avatar. */
const ROL_LABEL: Record<AsignacionConIntegrante['rol'], string> = {
  owner: 'Responsable',
  colaborador: 'Colaborador',
}

export interface AvatarStackProps {
  /** Asignados del lead. El repo ya los devuelve ordenados con el owner primero;
   *  este componente no reordena para no duplicar esa regla. */
  asignados: AsignacionConIntegrante[]
  /** Cuántos avatares se muestran antes del "+N". Default 3. */
  max?: number
  /** Lado del avatar en px. Default 20, el mismo que la tarjeta de tarea. */
  size?: number
}

/**
 * Stack de avatares de asignados, con overflow "+N".
 *
 * Patrón calcado del footer de `components/tareas/tarea-card.tsx` (flex
 * -space-x-1, borde del color de la tarjeta), extendido con el "+N" que a las
 * tareas les falta. Es puramente visual: sin handlers ni botones, así que no
 * captura el gesto de arrastre de @dnd-kit ni exige área táctil de 44px.
 */
export function AvatarStack({ asignados, max = 3, size = 20 }: AvatarStackProps) {
  if (asignados.length === 0) return null

  const visibles = asignados.slice(0, max)
  const resto = asignados.slice(max)

  return (
    <div className="flex -space-x-1" role="group" aria-label="Integrantes asignados">
      {visibles.map((a) => {
        const etiqueta = `${a.nombre} — ${ROL_LABEL[a.rol]}`
        return (
          <Avatar
            key={a.integrante_id}
            title={etiqueta}
            aria-label={etiqueta}
            style={{
              height: size,
              width: size,
              border: '1.5px solid var(--tx-bg-primary)',
            }}
          >
            <AvatarImage src={a.avatar_url ?? undefined} alt={etiqueta} />
            <AvatarFallback
              className="font-bold"
              style={{
                background: a.color ?? 'var(--tx-surface-2)',
                color: a.color ? '#fff' : 'var(--tx-ink-secondary)',
                fontSize: Math.round(size * 0.4),
              }}
            >
              {getInitials(a.nombre)}
            </AvatarFallback>
          </Avatar>
        )
      })}

      {resto.length > 0 && (
        <span
          title={`+${resto.length} más: ${resto.map((r) => r.nombre).join(', ')}`}
          aria-label={`${resto.length} integrantes más asignados`}
          className="rounded-full font-semibold flex items-center justify-center shrink-0"
          style={{
            height: size,
            width: size,
            background: 'var(--tx-surface-2)',
            color: 'var(--tx-ink-secondary)',
            fontSize: Math.round(size * 0.42),
          }}
        >
          +{resto.length}
        </span>
      )}
    </div>
  )
}
