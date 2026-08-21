import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, AlertCircle, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { TareaConResponsables } from '@/lib/types/tarea'

const prioridadConfig = {
  alta:  { label: 'Alta',  style: { background: 'oklch(63% 0.21 22 / 12%)', color: 'oklch(72% 0.17 22)',  border: '1px solid oklch(63% 0.21 22 / 28%)' } },
  media: { label: 'Media', style: { background: 'oklch(74% 0.17 55 / 12%)', color: 'oklch(80% 0.14 55)',  border: '1px solid oklch(74% 0.17 55 / 28%)' } },
  baja:  { label: 'Baja',  style: { background: 'oklch(72% 0.17 145 / 12%)',color: 'oklch(78% 0.14 145)', border: '1px solid oklch(72% 0.17 145 / 28%)' } },
}

const tipoConfig = {
  error:   { label: 'Bug',     style: { background: 'oklch(63% 0.21 22 / 10%)',  color: 'oklch(72% 0.17 22)',  border: '1px solid oklch(63% 0.21 22 / 20%)' } },
  feature: { label: 'Feature', style: { background: 'oklch(68% 0.18 230 / 10%)', color: 'oklch(75% 0.14 230)', border: '1px solid oklch(68% 0.18 230 / 22%)' } },
  pulir:   { label: 'Pulir',   style: { background: 'oklch(58% 0.24 292 / 10%)', color: 'oklch(72% 0.18 292)', border: '1px solid oklch(58% 0.24 292 / 22%)' } },
  general: { label: 'General', style: { background: 'oklch(100% 0 0 / 5%)',      color: 'oklch(65% 0 0)',      border: '1px solid oklch(100% 0 0 / 10%)' } },
}

const esfuerzoConfig = { pequeno: 'S', medio: 'M', grande: 'L' }

interface TareaCardProps {
  tarea: TareaConResponsables
  onClick?: () => void
  /** En la papelera: la tarjeta se ve apagada y muestra hace cuanto cayo ahi. */
  enPapelera?: boolean
}

export function TareaCard({ tarea, onClick, enPapelera }: TareaCardProps) {
  const isVencida =
    !enPapelera &&
    tarea.fecha_limite &&
    tarea.estado !== 'listo' &&
    new Date(tarea.fecha_limite) < new Date()

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      className="rounded-xl p-3 cursor-pointer select-none transition-all duration-150"
      style={{
        background: isVencida ? 'oklch(63% 0.21 22 / 6%)' : 'oklch(10% 0.004 240)',
        border: isVencida ? '1px solid oklch(63% 0.21 22 / 25%)' : '1px solid var(--tx-border)',
        opacity: enPapelera ? 0.55 : 1,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        if (!isVencida) (e.currentTarget as HTMLElement).style.border = '1px solid oklch(100% 0 0 / 12%)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        if (!isVencida) (e.currentTarget as HTMLElement).style.border = '1px solid var(--tx-border)'
      }}
    >
      {/* Tipo + esfuerzo */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={tipoConfig[tarea.tipo].style}
        >
          {tipoConfig[tarea.tipo].label}
        </span>
        <span
          className="text-[10px] font-mono font-semibold"
          style={{ color: 'var(--tx-ink-muted)' }}
        >
          {esfuerzoConfig[tarea.esfuerzo]}
        </span>
      </div>

      {/* Título */}
      <p
        className="text-[13px] font-medium leading-snug mb-2.5 line-clamp-2"
        style={{ color: 'var(--tx-ink-primary)' }}
      >
        {tarea.titulo}
      </p>

      {enPapelera && tarea.eliminado_at && (
        <div className="flex items-center gap-1 text-[10px] mb-2" style={{ color: 'var(--tx-ink-muted)' }}>
          <Trash2 size={10} />
          En la papelera · hace {formatDistanceToNow(new Date(tarea.eliminado_at), { locale: es })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={prioridadConfig[tarea.prioridad].style}
          >
            {prioridadConfig[tarea.prioridad].label}
          </span>

          {tarea.fecha_limite && (
            <span
              className="flex items-center gap-0.5 text-[10px]"
              style={{ color: isVencida ? 'oklch(72% 0.17 22)' : 'var(--tx-ink-muted)' }}
            >
              {isVencida ? <AlertCircle size={10} /> : <CalendarDays size={10} />}
              {format(new Date(tarea.fecha_limite), 'd MMM', { locale: es })}
            </span>
          )}
        </div>

        {tarea.responsables.length > 0 && (
          <div className="flex -space-x-1">
            {tarea.responsables.slice(0, 3).map((r) => (
              <Avatar key={r.integrante_id} className="h-5 w-5" style={{ border: '1.5px solid var(--tx-bg-primary)' }}>
                <AvatarImage src={r.avatar_url ?? undefined} />
                <AvatarFallback
                  className="text-[8px] font-bold"
                  style={{ background: 'var(--tx-surface-2)', color: 'var(--tx-ink-secondary)' }}
                >
                  {r.nombre.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
