'use client'

import { useState } from 'react'
import { DashFeed, FeedItem } from './dash-feed'
import { DashReader, DashStats } from './dash-reader'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'

interface DashWorkspaceProps {
  items: FeedItem[]
  stats: DashStats
}

export function DashWorkspace({ items, stats }: DashWorkspaceProps) {
  // Mantiene el dashboard al día sin recargar.
  useDatosVivos(['tareas', 'fact_leads', 'dim_clientes', 'reuniones'])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = items.find(i => i.id === selectedId) ?? null

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ isolation: 'isolate' }}
    >
      <div
        className="relative z-[2] h-full grid gap-[18px] p-[14px] md:p-[22px] grid-cols-1 md:grid-cols-[360px_1fr] overflow-y-auto md:overflow-visible"
      >
        {/* Col 1 — Feed */}
        <DashFeed
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          title="Leads & Contactos"
        />

        {/* Col 2 — Reader (en móvil solo cuando hay selección) */}
        <div className={`min-w-0 ${selected ? '' : 'hidden md:block'}`}>
          <DashReader item={selected} stats={stats} />
        </div>
      </div>
    </div>
  )
}
