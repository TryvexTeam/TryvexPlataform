'use client'

import { useMemo, useState } from 'react'
import type { DiaActividad } from '@/lib/types/perfil-integrante'

/**
 * Los cuadros verdes, como el calendario de contribuciones de GitHub, pero con
 * todo lo que la persona hizo en Tryvex: leads, mensajes, tareas y horas.
 *
 * Columnas = semanas (de domingo a sábado), la última es la actual. El tono sale
 * de comparar cada día con el día más activo del año, en 4 niveles.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const TONOS = [
  'var(--tx-surface-2)',
  'color-mix(in srgb, var(--tx-green) 30%, transparent)',
  'color-mix(in srgb, var(--tx-green) 55%, transparent)',
  'color-mix(in srgb, var(--tx-green) 80%, transparent)',
  'var(--tx-green)',
]

function nivel(total: number, maximo: number): number {
  if (total <= 0 || maximo <= 0) return 0
  return Math.min(4, Math.ceil((total / maximo) * 4))
}

function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

function describir(dia: DiaActividad): string {
  const fecha = new Date(`${dia.fecha}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  if (dia.total === 0) return `Sin actividad el ${fecha}`
  const partes = [
    dia.leads > 0 && `${dia.leads} contacto${dia.leads === 1 ? '' : 's'} con leads`,
    dia.mensajes > 0 && `${dia.mensajes} mensaje${dia.mensajes === 1 ? '' : 's'}`,
    dia.tareas > 0 && `${dia.tareas} tarea${dia.tareas === 1 ? '' : 's'} completada${dia.tareas === 1 ? '' : 's'}`,
    dia.horas > 0 && `${dia.horas.toLocaleString('es-CL')} h de jornada`,
  ].filter(Boolean)
  return `${partes.join(' · ')} el ${fecha}`
}

export function CalendarioActividad({ dias }: { dias: DiaActividad[] }) {
  const [enfocado, setEnfocado] = useState<DiaActividad | null>(null)

  const { semanas, maximo, total, etiquetasMes } = useMemo(() => {
    // Relleno al inicio para que la primera columna empiece en domingo.
    const relleno = dias.length > 0 ? diaSemana(dias[0].fecha) : 0
    const celdas: (DiaActividad | null)[] = [...Array(relleno).fill(null), ...dias]
    const cols: (DiaActividad | null)[][] = []
    for (let i = 0; i < celdas.length; i += 7) cols.push(celdas.slice(i, i + 7))

    // El nombre del mes va en la primera columna donde cambia el mes (una semana
    // que cruza dos meses no repite la etiqueta en la columna siguiente).
    const etiquetas: { col: number; mes: string }[] = []
    let mesAnterior = ''
    cols.forEach((col, i) => {
      const primerDia = col.find((d): d is DiaActividad => d !== null)
      if (!primerDia) return
      const mes = primerDia.fecha.slice(0, 7)
      if (mes !== mesAnterior) {
        // La primera columna solo se rotula si trae el mes completo por delante.
        if (i > 0 || Number(primerDia.fecha.slice(8, 10)) <= 7) {
          etiquetas.push({ col: i, mes: MESES[Number(mes.slice(5, 7)) - 1] })
        }
        mesAnterior = mes
      }
    })

    return {
      semanas: cols,
      maximo: Math.max(0, ...dias.map((d) => d.total)),
      total: dias.reduce((a, d) => a + d.total, 0),
      etiquetasMes: etiquetas,
    }
  }, [dias])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--tx-ink-secondary)]">
        <span className="font-semibold text-[var(--tx-ink-primary)]">{total.toLocaleString('es-CL')}</span> acciones en el último año
      </p>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1" role="grid" aria-label="Actividad del último año">
          <div className="relative h-4 text-[11px] text-[var(--tx-ink-muted)]" aria-hidden="true">
            {etiquetasMes.map(({ col, mes }) => (
              <span key={`${col}-${mes}`} className="absolute" style={{ left: col * 14 }}>
                {mes}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {semanas.map((semana, i) => (
              <div key={i} className="flex flex-col gap-[3px]" role="row">
                {Array.from({ length: 7 }, (_, d) => {
                  const dia = semana[d]
                  if (!dia) return <span key={d} className="h-[11px] w-[11px]" aria-hidden="true" />
                  const texto = describir(dia)
                  return (
                    <span
                      key={d}
                      role="gridcell"
                      tabIndex={0}
                      aria-label={texto}
                      title={texto}
                      onMouseEnter={() => setEnfocado(dia)}
                      onFocus={() => setEnfocado(dia)}
                      className="h-[11px] w-[11px] rounded-[2px] outline-offset-1 focus-visible:outline focus-visible:outline-[var(--tx-accent)]"
                      style={{ background: TONOS[nivel(dia.total, maximo)] }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--tx-ink-muted)]">
        <span aria-live="polite">{enfocado ? describir(enfocado) : 'Pasa el mouse por un día para ver el detalle'}</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          Menos
          {TONOS.map((tono) => (
            <span key={tono} className="h-[11px] w-[11px] rounded-[2px]" style={{ background: tono }} />
          ))}
          Más
        </span>
      </div>
    </div>
  )
}
