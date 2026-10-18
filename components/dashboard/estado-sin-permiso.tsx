import { LockIcon } from 'lucide-react'

interface EstadoSinPermisoProps {
  /** Nombre de la sección velada, para que se sepa que existe. */
  seccion: string
}

/**
 * Sección velada por falta de permiso.
 *
 * Ocultar no es seguridad — el candado real es la RLS. Esto solo evita que la
 * persona busque un dato que su cuenta no puede ver.
 */
export function EstadoSinPermiso({ seccion }: EstadoSinPermisoProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-full border border-white/[0.07] px-4 py-2.5"
    >
      <LockIcon aria-hidden className="size-4" style={{ color: 'var(--tx-ink-muted)' }} />
      <p className="text-sm" style={{ color: 'var(--tx-ink-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>{seccion}</span>
        {' '}está disponible, pero tu cuenta no tiene acceso. Pídeselo al administrador.
      </p>
    </div>
  )
}
