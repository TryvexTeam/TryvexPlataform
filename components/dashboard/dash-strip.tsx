'use client'

import { RelojJornada } from '@/components/jornada/reloj-jornada'
import type { Jornada } from '@/lib/types/jornada'
import {
  PRESENCIA_COLOR,
  PRESENCIA_LABEL,
  detallePresencia,
  type PresenciaIntegrante,
} from '@/lib/types/presencia'

interface DashStripProps {
  nombre: string
  jornadaAbierta: Jornada | null
  presenciaPropia?: PresenciaIntegrante | null
}

const ZONA = 'America/Santiago'

const FECHA_LARGA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Hora local de Santiago (0-23) del instante dado. Sin librerías de fecha. */
function horaSantiago(fecha: Date): number {
  const hh = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(fecha)
  return Number(hh)
}

function saludo(fecha: Date): string {
  const h = horaSantiago(fecha)
  if (h < 12) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Cabecera del panel: qué día es en Santiago, quién eres, si estás en turno.
 *
 * Sin caja ni halo: es texto sobre el fondo. Meter la cabecera en una tarjeta
 * la ponía al mismo nivel visual que los datos, y la jerarquía la tiene que
 * dar el tamaño de la tipografía, no un marco más.
 *
 * La fecha se calcula siempre en `America/Santiago`, nunca en el reloj del
 * navegador: un integrante de viaje debe seguir viendo el día de la operación.
 */
export function DashStrip({ nombre, jornadaAbierta, presenciaPropia }: DashStripProps) {
  const ahora = new Date()
  const estado = presenciaPropia?.estado ?? 'inactivo'
  const detalle = detallePresencia(presenciaPropia ?? undefined)

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--tx-ink-muted)]"
          suppressHydrationWarning
        >
          {capitalizar(FECHA_LARGA.format(ahora))}
        </p>

        <h2 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.045em] text-[var(--tx-ink-primary)] md:text-[40px]">
          <span suppressHydrationWarning>{saludo(ahora)}</span>, {nombre}
        </h2>

        <p className="mt-3.5 flex items-center gap-2 text-[13px] text-[var(--tx-ink-secondary)]">
          <span className="relative flex size-2" aria-hidden>
            {estado === 'disponible' && (
              <span
                className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                style={{ background: PRESENCIA_COLOR[estado] }}
              />
            )}
            <span
              className="relative inline-flex size-2 rounded-full"
              style={{ background: PRESENCIA_COLOR[estado] }}
            />
          </span>
          <span>{detalle ?? PRESENCIA_LABEL[estado]}</span>
        </p>
      </div>

      <div className="shrink-0">
        <RelojJornada jornadaInicial={jornadaAbierta} variante="compacto" />
      </div>
    </div>
  )
}
