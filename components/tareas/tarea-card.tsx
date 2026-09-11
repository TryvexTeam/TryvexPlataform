import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, AlertCircle, Trash2, ListChecks } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { TareaConResponsables } from '@/lib/types/tarea'
import { parseFechaLocal } from '@/lib/utils/fecha-santiago'
import type { ProgresoSubtareas } from '@/lib/utils/progreso-subtareas'

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
  /** Avance de los pasos. `undefined` = la tarea no tiene pasos y no se muestra
   *  nada: una tarjeta que dice "0/0" solo ocupa espacio. */
  progreso?: ProgresoSubtareas
  /** Abre el modal de pasos sin salir del tablero. Si no viene, el bloque de
   *  avance se pinta igual pero no es apretable. */
  onAbrirPasos?: () => void
}

export function TareaCard({ tarea, onClick, enPapelera, progreso, onAbrirPasos }: TareaCardProps) {
  const isVencida =
    !enPapelera &&
    tarea.fecha_limite &&
    tarea.estado !== 'listo' &&
    parseFechaLocal(tarea.fecha_limite) < new Date()

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Solo Enter: esta tarjeta vive dentro de un SortableCard (dnd-kit),
        // cuyo wrapper ya usa Espacio para levantar el drag — si esta tarjeta
        // también reaccionara a Espacio, dispararía onClick Y, al burbujear,
        // el "recoger para arrastrar" del wrapper con la misma tecla.
        if (e.key === 'Enter') {
          e.preventDefault()
          onClick?.()
        }
      }}
      className="rounded-xl px-2.5 py-2 cursor-pointer select-none transition-all duration-150"
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
      {/* Fila 1: tipo, título y esfuerzo en la misma línea.

          El título va a UNA línea (antes eran hasta dos): con dos, media
          columna quedaba dentada y entraban menos tarjetas en pantalla. El
          título completo sigue estando en el `title` y dentro de la ficha. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
          style={tipoConfig[tarea.tipo].style}
        >
          {tipoConfig[tarea.tipo].label}
        </span>
        <p
          title={tarea.titulo}
          className="flex-1 min-w-0 truncate text-[13px] font-medium leading-snug"
          style={{ color: 'var(--tx-ink-primary)' }}
        >
          {tarea.titulo}
        </p>
        <span
          className="text-[10px] font-mono font-semibold shrink-0"
          style={{ color: 'var(--tx-ink-muted)' }}
        >
          {esfuerzoConfig[tarea.esfuerzo]}
        </span>
      </div>

      {enPapelera && tarea.eliminado_at && (
        <div className="flex items-center gap-1 text-[10px] mt-1" style={{ color: 'var(--tx-ink-muted)' }}>
          <Trash2 size={10} />
          En la papelera · hace {formatDistanceToNow(new Date(tarea.eliminado_at), { locale: es })}
        </div>
      )}

      {/* Fila 2: prioridad, fecha, pasos y responsables.

          `min-h-7` fija el alto de la fila. Sin eso, la tarjeta que tiene pasos
          medía 73px y la que no, 65: el chip de pasos es tocable (44px reales
          recortados con márgenes negativos) y estiraba la fila solo en algunas.
          Con la altura fija, todas las tarjetas miden lo mismo — que es lo que
          permite calcular de un vistazo cuántas entran en la columna. */}
      <div className="flex min-h-7 items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
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
              {format(parseFechaLocal(tarea.fecha_limite), 'd MMM', { locale: es })}
            </span>
          )}

          {/* El avance de los pasos: antes era una barra con su propia fila, lo
              que hacía que unas tarjetas fueran más altas que otras. Ahora es
              una pastilla en esta misma fila y abre el mismo modal.

              `stopPropagation`: la tarjeta entera navega a la tarea; sin esto,
              tocar los pasos abriría el modal Y navegaría. */}
          {progreso && progreso.total > 0 && (
            <button
              type="button"
              disabled={!onAbrirPasos}
              onClick={(e) => {
                e.stopPropagation()
                onAbrirPasos?.()
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Ver los ${progreso.total} pasos de ${tarea.titulo}`}
              // Zona tocable de 44px sin que la tarjeta crezca: el alto se gana
              // con padding vertical que los márgenes negativos devuelven.
              className="-my-2 flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1 text-[10px] font-medium transition-colors enabled:hover:bg-white/[0.06] disabled:cursor-default"
              style={{
                color:
                  progreso.hechas === progreso.total
                    ? 'oklch(72% 0.17 145)'
                    : 'var(--tx-ink-muted)',
              }}
            >
              <ListChecks size={10} />
              {progreso.hechas}/{progreso.total}
            </button>
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
