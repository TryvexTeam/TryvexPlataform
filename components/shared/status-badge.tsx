import { cn } from '@/lib/utils'

export type LeadEstado =
  | 'nuevo'
  | 'contactado'
  | 'calificado'
  | 'propuesta'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

export type TareaEstado = 'pendiente' | 'en_progreso' | 'completada' | 'bloqueada'
export type ProyectoEstado = 'activo' | 'pausado' | 'completado' | 'cancelado'

export type AnyEstado = LeadEstado | TareaEstado | ProyectoEstado | string

interface StatusConfig {
  dot: string
  label: string
  style: { background: string; color: string; border: string }
}

const configs: Record<string, StatusConfig> = {
  // Leads
  nuevo:        { dot: 'oklch(60% 0 0)',        label: 'Nuevo',        style: { background: 'oklch(100% 0 0 / 5%)',    color: 'oklch(65% 0 0)',          border: '1px solid oklch(100% 0 0 / 10%)' } },
  contactado:   { dot: 'oklch(68% 0.18 230)',   label: 'Contactado',   style: { background: 'oklch(68% 0.18 230 / 12%)', color: 'oklch(75% 0.14 230)',     border: '1px solid oklch(68% 0.18 230 / 25%)' } },
  calificado:   { dot: 'oklch(58% 0.24 292)',   label: 'Calificado',   style: { background: 'oklch(58% 0.24 292 / 12%)', color: 'oklch(72% 0.18 292)',     border: '1px solid oklch(58% 0.24 292 / 28%)' } },
  propuesta:    { dot: 'oklch(74% 0.17 55)',    label: 'Propuesta',    style: { background: 'oklch(74% 0.17 55 / 12%)',  color: 'oklch(80% 0.14 55)',      border: '1px solid oklch(74% 0.17 55 / 28%)' } },
  negociacion:  { dot: 'oklch(70% 0.19 40)',    label: 'Negociación',  style: { background: 'oklch(70% 0.19 40 / 12%)',  color: 'oklch(78% 0.15 40)',      border: '1px solid oklch(70% 0.19 40 / 28%)' } },
  ganado:       { dot: 'oklch(72% 0.17 145)',   label: 'Ganado',       style: { background: 'oklch(72% 0.17 145 / 12%)', color: 'oklch(78% 0.14 145)',     border: '1px solid oklch(72% 0.17 145 / 28%)' } },
  perdido:      { dot: 'oklch(63% 0.21 22)',    label: 'Perdido',      style: { background: 'oklch(63% 0.21 22 / 12%)',  color: 'oklch(72% 0.17 22)',      border: '1px solid oklch(63% 0.21 22 / 28%)' } },
  // Tareas
  pendiente:    { dot: 'oklch(60% 0 0)',        label: 'Pendiente',    style: { background: 'oklch(100% 0 0 / 5%)',    color: 'oklch(65% 0 0)',          border: '1px solid oklch(100% 0 0 / 10%)' } },
  en_progreso:  { dot: 'oklch(68% 0.18 230)',   label: 'En progreso',  style: { background: 'oklch(68% 0.18 230 / 12%)', color: 'oklch(75% 0.14 230)',     border: '1px solid oklch(68% 0.18 230 / 25%)' } },
  completada:   { dot: 'oklch(72% 0.17 145)',   label: 'Completada',   style: { background: 'oklch(72% 0.17 145 / 12%)', color: 'oklch(78% 0.14 145)',     border: '1px solid oklch(72% 0.17 145 / 28%)' } },
  bloqueada:    { dot: 'oklch(63% 0.21 22)',    label: 'Bloqueada',    style: { background: 'oklch(63% 0.21 22 / 12%)',  color: 'oklch(72% 0.17 22)',      border: '1px solid oklch(63% 0.21 22 / 28%)' } },
  // Proyectos
  activo:       { dot: 'oklch(72% 0.17 145)',   label: 'Activo',       style: { background: 'oklch(72% 0.17 145 / 12%)', color: 'oklch(78% 0.14 145)',     border: '1px solid oklch(72% 0.17 145 / 28%)' } },
  pausado:      { dot: 'oklch(74% 0.17 55)',    label: 'Pausado',      style: { background: 'oklch(74% 0.17 55 / 12%)',  color: 'oklch(80% 0.14 55)',      border: '1px solid oklch(74% 0.17 55 / 28%)' } },
  completado:   { dot: 'oklch(60% 0 0)',        label: 'Completado',   style: { background: 'oklch(100% 0 0 / 5%)',    color: 'oklch(65% 0 0)',          border: '1px solid oklch(100% 0 0 / 10%)' } },
  cancelado:    { dot: 'oklch(63% 0.21 22)',    label: 'Cancelado',    style: { background: 'oklch(63% 0.21 22 / 12%)',  color: 'oklch(72% 0.17 22)',      border: '1px solid oklch(63% 0.21 22 / 28%)' } },
}

const fallback: StatusConfig = {
  dot: 'oklch(60% 0 0)',
  label: '',
  style: { background: 'oklch(100% 0 0 / 5%)', color: 'oklch(65% 0 0)', border: '1px solid oklch(100% 0 0 / 10%)' },
}

interface StatusBadgeProps {
  status: AnyEstado
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  const config = configs[status] ?? fallback
  const displayLabel = label ?? config.label ?? status

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        className
      )}
      style={config.style}
    >
      <span
        className={cn('rounded-full shrink-0', size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5')}
        style={{ background: config.dot }}
      />
      {displayLabel}
    </span>
  )
}
