'use client'

import { useMemo, useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    return <p className="text-sm text-neutral-500">Todavía no hay marcajes en este período.</p>
  }

  return (
    <div className="space-y-3">
      {mostrarPersona && (
        <div className="flex items-center gap-2">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por persona"
            className="h-9 flex-1 max-w-xs rounded-md border border-neutral-200 px-3 text-sm"
            aria-label="Filtrar por persona"
          />
          <Button size="sm" variant="secondary" onClick={exportarCsv}>
            <DownloadIcon className="size-4" />
            CSV
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              {mostrarPersona && <th className="text-left font-medium px-3 py-2">Persona</th>}
              <th className="text-left font-medium px-3 py-2">Fecha</th>
              <th className="text-left font-medium px-3 py-2">Entrada</th>
              <th className="text-left font-medium px-3 py-2">Salida</th>
              <th className="text-right font-medium px-3 py-2">Horas</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className="border-t border-neutral-100">
                {mostrarPersona && <td className="px-3 py-2 text-neutral-800">{f.integrante_nombre}</td>}
                <td className="px-3 py-2 text-neutral-600">{FECHA.format(new Date(f.entrada_at))}</td>
                <td className="px-3 py-2 tabular-nums">{HORA.format(new Date(f.entrada_at))}</td>
                <td className="px-3 py-2 tabular-nums">
                  {f.salida_at ? (
                    HORA.format(new Date(f.salida_at))
                  ) : (
                    <span className="text-emerald-600">en curso</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(f.horas).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
