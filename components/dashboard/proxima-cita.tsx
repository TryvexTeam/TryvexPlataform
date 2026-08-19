import { VideoIcon } from 'lucide-react'
import { ScoopCard } from '@/components/dashboard/scoop-card'
import type { Evento } from '@/lib/types/evento'

/**
 * La próxima cita de hoy, como tarjeta de acento.
 *
 * Es la acción siguiente del día, y por eso es lo único rojo de la pantalla.
 * Cuando no hay cita el acento pasa a la primera tarea, así que quien decide
 * es la página: aquí solo se pinta lo que llega.
 *
 * Presentacional a propósito. El evento lo consulta `page.tsx`, que también
 * necesita saber si existe para no pintar dos acentos en la misma pantalla —
 * consultarlo aquí dentro obligaría a pedirlo dos veces.
 */

interface ProximaCitaProps {
  cita: Evento
}

const HORA_SANTIAGO = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
})

/** Minutos que dura el evento, para el subtítulo. */
function duracionMin(evento: Evento): number | null {
  const min = Math.round(
    (new Date(evento.fin).getTime() - new Date(evento.inicio).getTime()) / 60_000,
  )
  return Number.isFinite(min) && min > 0 ? min : null
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '·'
  )
}

export function ProximaCita({ cita }: ProximaCitaProps) {
  const duracion = duracionMin(cita)
  const asistentes = cita.asistentes.slice(0, 3)

  return (
    <ScoopCard
      href="/reuniones"
      accion="Ir al calendario"
      Icono={VideoIcon}
      acento
      className="w-full p-5 md:w-[340px]"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white">
        Ahora · {HORA_SANTIAGO.format(new Date(cita.inicio))}
        {duracion !== null && ` · ${duracion} min`}
      </p>

      <p className="mt-3.5 line-clamp-2 text-[21px] font-semibold leading-tight tracking-[-0.025em] text-white">
        {cita.titulo}
      </p>

      {asistentes.length > 0 && (
        <div className="mt-4 flex items-center gap-2.5">
          <div className="flex">
            {asistentes.map((asistente, i) => (
              <div
                key={asistente.integrante_id}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white/20 bg-black/25 text-[9px] font-medium text-white"
                style={{ marginLeft: i > 0 ? '-8px' : 0 }}
              >
                {iniciales(asistente.nombre)}
              </div>
            ))}
          </div>
          <p className="truncate text-xs text-white">
            {cita.asistentes.length === 1
              ? cita.asistentes[0]?.nombre
              : `${cita.asistentes.length} participantes`}
          </p>
        </div>
      )}
    </ScoopCard>
  )
}
