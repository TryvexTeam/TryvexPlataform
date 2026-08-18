'use client'

import { useMemo, useState } from 'react'
import { DownloadIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hashColorHex, getInitials } from '@/lib/utils/lead-utils'
import type { JornadaResumen } from '@/lib/types/jornada'

interface TablaJornadasProps {
  filas: JornadaResumen[]
  /** El admin ve la columna con el nombre del integrante. */
  mostrarPersona: boolean
}

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

const FECHA = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Santiago',
})

// Referencia para la barra de cada dia: una jornada de 8h la llena entera.
// No es un limite -- un dia de 10h simplemente se ve lleno y un poco mas.
const JORNADA_REFERENCIA_H = 8

export function TablaJornadas({ filas, mostrarPersona }: TablaJornadasProps) {
  const [filtro, setFiltro] = useState('')

  const visibles = useMemo(() => {
    if (!filtro.trim()) return filas
    const q = filtro.toLowerCase()
    return filas.filter((f) => f.integrante_nombre.toLowerCase().includes(q))
  }, [filas, filtro])

  const exportarCsv = () => {
    const cabecera = ['Persona', 'Email', 'Fecha', 'Entrada', 'Salida', 'Horas', 'Nota']
    const lineas = visibles.map((f) => [
      f.integrante_nombre,
      f.integrante_email,
      f.fecha_local,
      HORA.format(new Date(f.entrada_at)),
      f.salida_at ? HORA.format(new Date(f.salida_at)) : '',
      Number(f.horas).toFixed(2),
      (f.nota ?? '').replace(/[\r\n";]/g, ' '),
    ])
    const csv = [cabecera, ...lineas].map((fila) => fila.map((c) => `"${c}"`).join(';')).join('\n')
    // BOM para que Excel en español abra los acentos bien.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jornadas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (filas.length === 0) {
    return <p className="text-sm text-[var(--tx-ink-muted)]">Todavía no hay marcajes en este período.</p>
  }

  return (
    <div className="space-y-3">
      {mostrarPersona && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--tx-ink-muted)' }} />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por persona"
              className="h-9 w-full rounded-lg pl-9 pr-3 text-sm outline-none"
              style={{ background: 'var(--tx-surface-2)', border: '1px solid var(--tx-border)', color: 'var(--tx-ink-primary)' }}
              aria-label="Filtrar por persona"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={exportarCsv}>
            <DownloadIcon className="size-4" />
            CSV
          </Button>
        </div>
      )}

      <ul
        className="rounded-2xl overflow-hidden divide-y"
        style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)', borderColor: 'var(--tx-border)' }}
      >
        {visibles.map((f) => {
          const horas = Number(f.horas)
          const enCurso = !f.salida_at
          const llenado = Math.min(100, (horas / JORNADA_REFERENCIA_H) * 100)
          const color = hashColorHex(f.integrante_nombre)

          const rango = (
            <p className="tabular-nums text-[13px] text-[var(--tx-ink-secondary)] whitespace-nowrap">
              {HORA.format(new Date(f.entrada_at))}
              <span className="mx-1" style={{ color: 'var(--tx-ink-muted)' }}>→</span>
              {f.salida_at ? (
                HORA.format(new Date(f.salida_at))
              ) : (
                <span className="font-semibold" style={{ color: 'var(--tx-success)' }}>en curso</span>
              )}
            </p>
          )

          const barra = (
            // Barra: cuanto de una jornada de referencia (8h) ocupo este dia.
            // Convierte una columna de numeros en algo que se lee de un
            // vistazo -- que dias fueron largos y cuales cortos.
            <div className="flex-1 min-w-[40px] h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tx-surface-2)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${llenado}%`,
                  background: enCurso ? 'var(--tx-success)' : 'var(--tx-accent)',
                  opacity: enCurso ? 0.7 : 1,
                }}
              />
            </div>
          )

          const avatar = mostrarPersona && (
            <div
              className="shrink-0 size-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: color }}
              title={f.integrante_nombre}
            >
              {getInitials(f.integrante_nombre)}
            </div>
          )

          return (
            <li
              key={f.id}
              className="px-4 py-3 transition-colors hover:bg-[var(--tx-surface-2)]"
              style={{ borderColor: 'var(--tx-border)' }}
            >
              {/* Celular: todo apilado, la fila horizontal de escritorio no
                  entra en un ancho de telefono sin cortar el numero de horas
                  (pasaba con la version anterior, de ahi el rediseno). */}
              <div className="flex sm:hidden flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {avatar}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--tx-ink-primary)] capitalize">
                        {FECHA.format(new Date(f.entrada_at))}
                        {mostrarPersona && (
                          <span className="ml-1.5 font-normal text-[var(--tx-ink-muted)] truncate">
                            · {f.integrante_nombre}
                          </span>
                        )}
                      </p>
                      {rango}
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums text-[13px] font-semibold text-[var(--tx-ink-primary)]">
                    {horas.toFixed(2)} h
                  </span>
                </div>
                {barra}
              </div>

              <div className="hidden sm:flex items-center gap-4">
                {avatar}
                <div className="w-[76px] shrink-0">
                  <p className="text-[13px] font-medium text-[var(--tx-ink-primary)] capitalize">
                    {FECHA.format(new Date(f.entrada_at))}
                  </p>
                </div>
                {mostrarPersona && (
                  <p className="w-32 shrink-0 truncate text-[13px] text-[var(--tx-ink-secondary)]">
                    {f.integrante_nombre}
                  </p>
                )}
                <div className="w-44 shrink-0">{rango}</div>
                {barra}
                <span className="w-14 shrink-0 text-right tabular-nums text-[13px] font-semibold text-[var(--tx-ink-primary)]">
                  {horas.toFixed(2)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
