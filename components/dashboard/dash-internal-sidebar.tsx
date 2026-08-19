'use client'

import { useState } from 'react'
import { Bell, Users, FolderKanban, CheckSquare, Inbox, Send, Edit3, Trash2, Layers, ChevronDown, MoreHorizontal } from 'lucide-react'
import { HaloAvatar } from './halo-avatar'

/* ── Nav sections data — exact match with reference mockup ── */
const INBOX_FOLDERS = [
  { id: 'inbox',    label: 'Inbox',            icon: Inbox,          count: null },
  { id: 'assigned', label: 'Assigned to me',   icon: CheckSquare,    count: null },
  { id: 'shared',   label: 'Shared with me',   icon: Layers,         count: 2 },
  { id: 'all',      label: 'All',              icon: FolderKanban,   count: null },
  { id: 'drafts',   label: 'Drafts',           icon: Edit3,          count: 3 },
  { id: 'sent',     label: 'Sent',             icon: Send,           count: null },
  { id: 'trash',    label: 'Trash',            icon: Trash2,         count: null },
  { id: 'more',     label: 'More',             icon: MoreHorizontal, count: null },
]

const TEAMS = [
  { id: 'success', label: 'Customer Success', color: '#A855F7', count: 6 },
  { id: 'tier1',   label: 'Tier 1',           color: '#F59E0B', count: 2 },
  { id: 'tier2',   label: 'Tier 2',           color: '#FFFFFF', count: 4 },
  { id: 'twitter', label: 'Twitter',          color: '#3B82F6', count: 2 },
]

interface DashSidebarProps {
  active: string
  onSelect: (id: string) => void
}

function SidebarGroup({
  head,
  children,
  open,
  onToggle,
}: {
  head: React.ReactNode
  children: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className={`group ${open ? 'is-open' : ''} w-full`}>
      <button className="group__head cursor-pointer w-full" onClick={onToggle}>
        <span className="group__chevron">
          <ChevronDown size={14} />
        </span>
        <span className="group__title">{head}</span>
      </button>
      {open && <div className="group__body pl-1.5">{children}</div>}
    </div>
  )
}

export function DashInternalSidebar({ active, onSelect }: DashSidebarProps) {
  const [open, setOpen] = useState({ mail: true, teams: true })

  return (
    <aside
      className="glass flex flex-col"
      style={{
        padding: '14px 8px',
        gap: 2,
        overflow: 'hidden auto',
        height: '100%',
      }}
    >
      {/* Top: Avatar (female profile photo with online indicator) + Bell + Compose */}
      <div className="flex items-center justify-between px-3 py-1">
        <div className="flex items-center gap-2.5">
          <HaloAvatar
            initials="TV"
            accent="gradient"
            size={36}
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80"
            online
          />
          <button
            className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--tx-ink-secondary)' }}
            aria-label="Notificaciones"
          >
            <Bell size={18} />
          </button>
        </div>
        <button
          className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center transition-all hover:-translate-y-0.5"
          style={{
            background: 'var(--tx-accent)',
            color: 'var(--tx-accent-fg)',
            boxShadow: '0 10px 30px rgba(139,92,246,.55), inset 0 1px 0 rgba(255,255,255,.18)',
          }}
          aria-label="Componer"
        >
          <Edit3 size={18} />
        </button>
      </div>

      {/* Group: Inbox */}
      <SidebarGroup
        open={open.mail}
        onToggle={() => setOpen(o => ({ ...o, mail: !o.mail }))}
        head={
          <div className="flex items-center gap-2">
            <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center bg-[#8B5CF6]/15 border border-[#8B5CF6]/20 text-[#8B5CF6]">
              <Inbox size={12} />
            </span>
            <span className="font-semibold text-[13px] text-white">Inbox</span>
          </div>
        }
      >
        {INBOX_FOLDERS.map(f => (
          <button
            key={f.id}
            className={`nav-item w-full ${active === f.id ? 'is-active' : ''}`}
            onClick={() => onSelect(f.id)}
          >
            <span className="nav-item__icon">
              <f.icon size={15} />
            </span>
            <span className="nav-item__label">{f.label}</span>
            {f.count != null && (
              <span className="nav-item__count">{f.count}</span>
            )}
          </button>
        ))}
      </SidebarGroup>

      {/* Group: Customer Success */}
      <SidebarGroup
        open={open.teams}
        onToggle={() => setOpen(o => ({ ...o, teams: !o.teams }))}
        head={
          <div className="flex items-center gap-2 w-full">
            <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center bg-[#8B5CF6]/15 border border-[#8B5CF6]/20 text-[#8B5CF6]">
              <Users size={12} />
            </span>
            <span className="font-semibold text-[13px] text-white">Customer Success</span>
            <span className="nav-item__count ml-auto" style={{ background: 'rgba(255,255,255,0.06)' }}>13</span>
          </div>
        }
      >
        {TEAMS.map(t => (
          <button
            key={t.id}
            className={`nav-item w-full ${active === t.id ? 'is-active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <span
              className="nav-item__dot"
              style={{
                background: t.color,
                boxShadow: `0 0 12px ${t.color}88`,
              }}
            />
            <span className="nav-item__label">{t.label}</span>
            <span className="nav-item__count">{t.count}</span>
          </button>
        ))}
      </SidebarGroup>
    </aside>
  )
}

