'use client'

import { useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import { CalendarioSemana } from './calendario-semana'
import { DisponibilidadGrid } from './disponibilidad-grid'

const TABS = [
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'disponibilidad', label: 'Mi disponibilidad', icon: Clock },
] as const

type TabId = typeof TABS[number]['id']

export function EquipoTabs() {
  const [tab, setTab] = useState<TabId>('calendario')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg border transition-colors"
            style={
              tab === id
                ? {
                    background: 'var(--tx-accent-subtle)',
                    borderColor: 'color-mix(in oklab, var(--tx-accent) 35%, transparent)',
                    color: 'color-mix(in oklab, var(--tx-accent) 85%, white)',
                  }
                : {
                    background: 'transparent',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color: 'var(--tx-ink-muted)',
                  }
            }
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendario' ? <CalendarioSemana /> : <DisponibilidadGrid />}
    </div>
  )
}
