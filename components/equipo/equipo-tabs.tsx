'use client'

import { useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import { CalendarioSemana } from './calendario-semana'
import { DisponibilidadGrid } from './disponibilidad-grid'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'

const TABS = [
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'disponibilidad', label: 'Mi disponibilidad', icon: Clock },
] as const

type TabId = typeof TABS[number]['id']

export function EquipoTabs() {
  // Mantiene el calendario del equipo al día sin recargar.
  useDatosVivos(['reuniones', 'disponibilidad', 'jornadas', 'dim_integrantes'])

  const [tab, setTab] = useState<TabId>('calendario')

  return (
    <div className="flex flex-col gap-4">
      {/* Pestañas dentro de un solo carril, como el selector del Panel de
          Mando. La activa va en blanco y no en acento: el rojo está reservado
          para lo que hay que atender, y una pestaña no es una alerta. */}
      <div
        role="tablist"
        aria-label="Vistas del equipo"
        className="inline-flex gap-1 self-start rounded-full border border-white/[0.07] bg-white/[0.03] p-1"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const activa = tab === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={activa}
              onClick={() => setTab(id)}
              className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors ${
                activa
                  ? 'bg-white text-[var(--tx-bg-primary)]'
                  : 'text-[var(--tx-ink-secondary)] hover:text-[var(--tx-ink-primary)]'
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'calendario' ? <CalendarioSemana /> : <DisponibilidadGrid />}
    </div>
  )
}
