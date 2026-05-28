import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, AlertCircle, Zap, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { TareaConResponsables } from '@/lib/types/tarea'
import { cn } from '@/lib/utils'

const prioridadConfig = {
  alta: { label: 'Alta', class: 'bg-red-100 text-red-700 border-red-200' },
  media: { label: 'Media', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  baja: { label: 'Baja', class: 'bg-green-100 text-green-700 border-green-200' },
}

const tipoConfig = {
  error: { label: 'Bug', class: 'bg-red-50 text-red-600' },
  feature: { label: 'Feature', class: 'bg-blue-50 text-blue-600' },
  pulir: { label: 'Pulir', class: 'bg-purple-50 text-purple-600' },
  general: { label: 'General', class: 'bg-neutral-50 text-neutral-600' },
}

const esfuerzoConfig = {
  pequeno: 'S',
  medio: 'M',
  grande: 'L',
}

interface TareaCardProps {
  tarea: TareaConResponsables
  onClick?: () => void
}

export function TareaCard({ tarea, onClick }: TareaCardProps) {
  const isVencida =
    tarea.fecha_limite &&
    tarea.estado !== 'listo' &&
    new Date(tarea.fecha_limite) < new Date()

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border border-neutral-200 p-3 cursor-pointer',
        'hover:border-neutral-300 hover:shadow-sm transition-all select-none',
        isVencida && 'border-red-200 bg-red-50/30'
      )}
    >
      {/* Tipo + esfuerzo */}
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', tipoConfig[tarea.tipo].class)}>
          {tipoConfig[tarea.tipo].label}
        </span>
        <span className="text-xs text-neutral-400 font-mono">{esfuerzoConfig[tarea.esfuerzo]}</span>
      </div>

      {/* Título */}
      <p className="text-sm font-medium text-neutral-800 leading-snug mb-2 line-clamp-2">
        {tarea.titulo}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn('text-xs h-5 px-1.5', prioridadConfig[tarea.prioridad].class)}>
            {prioridadConfig[tarea.prioridad].label}
          </Badge>

          {tarea.fecha_limite && (
            <span className={cn('flex items-center gap-0.5 text-xs', isVencida ? 'text-red-500' : 'text-neutral-400')}>
              {isVencida ? <AlertCircle size={11} /> : <CalendarDays size={11} />}
              {format(new Date(tarea.fecha_limite), 'd MMM', { locale: es })}
            </span>
          )}
        </div>

        {/* Responsables */}
        {tarea.responsables.length > 0 && (
          <div className="flex -space-x-1">
            {tarea.responsables.slice(0, 3).map((r) => (
              <Avatar key={r.integrante_id} className="h-5 w-5 border border-white">
                <AvatarImage src={r.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px] bg-neutral-200">
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
