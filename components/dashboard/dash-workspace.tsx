'use client'

import { useState } from 'react'
import { DashFeed, FeedItem } from './dash-feed'
import { DashReader, DashStats } from './dash-reader'

interface DashWorkspaceProps {
  items: FeedItem[]
  stats: DashStats
}

export function DashWorkspace({ items, stats }: DashWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = items.find(i => i.id === selectedId) ?? null

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ isolation: 'isolate' }}
    >
      <div
        className="relative z-[2] h-full grid gap-[18px] p-[22px]"
        style={{
          gridTemplateColumns: '360px 1fr',
        }}
      >
        {/* Col 1 — Feed */}
        <DashFeed
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          title="Leads & Contactos"
        />

        {/* Col 2 — Reader */}
        <DashReader item={selected} stats={stats} />
      </div>
    </div>
  )
}
