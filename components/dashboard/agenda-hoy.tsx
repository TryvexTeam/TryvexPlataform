import { createClient } from '@/lib/supabase/server'
import { EventosRepository } from '@/lib/repos/eventos'
import { EstadoVacio } from '@/components/dashboard/estado-vacio'
import { EstadoError } from '@/components/dashboard/estado-error'
import { inicioDiaSantiago } from '@/lib/utils/fecha-santiago'
import type { Evento } from '@/lib/types/evento'

interface AgendaHoyProps {
  /** auth user id: `listRango` lo usa para marcar `es_mio`. */
  authUserId: string
  /** Integrante actual: filtra eventos donde participo (asistente o creador). */
  integranteId: string | null
}

const HORA_SANTIAGO = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
})

/** Cuántas citas alcanzan a verse en la celda sin volverla infinita. */
const MAX_CITAS = 5

function sonMias(evento: Evento, integranteId: string | null): boolean {
  if (evento.es_mio) return true
  if (!integranteId) return false
  return evento.asistentes.some((a) => a.integrante_id === integranteId)
}

/**
 * Próximas citas de HOY del integrante (T-003 §5, KPI #16: "¿Qué reuniones
 * tengo?"). Server Component async: se trae sus propios datos vía
 * `EventosRepository.listRango` (regla del proyecto: Supabase solo desde
 * `lib/repos/`).
 *
 * Ventana: desde ahora hasta el fin del día de Santiago — este panel se
 * mira para decidir el día, no la semana (eso vive en `/reuniones`).
 */
export async function AgendaHoy({ authUserId, integranteId }: AgendaHoyProps) {
  const supabase = await createClient()
  const ahora = new Date()
  // Mañana Santiago = hoy - (-1): la ventana cierra a medianoche de hoy.
  const finDeHoy = inicioDiaSantiago(-1)

  let eventos: Evento[]
  try {
    const todos = await new EventosRepository(supabase).listRango(
      ahora.toISOString(),
      finDeHoy.toISOString(),
      authUserId,
    )
    eventos = todos.filter((e) => sonMias(e, integranteId)).slice(0, MAX_CITAS)
  } catch {
    return <EstadoError mensaje="La agenda no respondió. Vuelve a cargar el panel." />
  }

  if (eventos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin reuniones hoy"
        descripcion="No queda nada agendado para el resto del día."
        ctaLabel="Ver calendario"
        ctaHref="/reuniones"
      />
    )
  }

  return (
    <ul className="flex flex-col">
      {eventos.map((evento) => (
        <li
          key={evento.id}
          className="flex min-h-[44px] items-baseline gap-3 border-b py-2 last:border-b-0"
          style={{ borderColor: 'var(--tx-border)' }}
        >
          <span
            className="shrink-0 text-sm font-bold tabular-nums"
            style={{ color: 'var(--tx-accent)' }}
          >
            {HORA_SANTIAGO.format(new Date(evento.inicio))}
          </span>
          <span className="text-sm" style={{ color: 'var(--tx-ink-secondary)' }}>
            {evento.titulo}
          </span>
        </li>
      ))}
    </ul>
  )
}
