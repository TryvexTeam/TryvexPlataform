'use client'

import { useState, useMemo } from 'react'
import { Search, PenSquare } from 'lucide-react'
import { motion } from 'framer-motion'
import { HaloAvatar } from './halo-avatar'

/* ── Data types ── */
export interface FeedItem {
  id: string
  name: string
  initials: string
  accent: string
  when: string
  tag?: string | null
  tagTone?: 'violet' | 'amber' | 'cyan' | 'yellow' | 'yellow-light'
  subject: string
  snippet: string
  folder?: string
  team?: string
  unread?: boolean
  draft?: string
  status?: string
  valor?: string
  avatar?: string
  count?: number
}

/* ── Tag badge ── */
function TagBadge({ tag, tone }: { tag: string; tone: string }) {
  if (tone === 'yellow') {
    return (
      <span className="tag" style={{ background: '#FDE047', color: '#000', border: '1px solid #EAB308', fontWeight: 700 }}>
        #{tag}
      </span>
    )
  }
  if (tone === 'yellow-light') {
    return (
      <span className="tag" style={{ background: '#FEF08A', color: '#000', border: '1px solid #CA8A04', fontWeight: 700 }}>
        #{tag}
      </span>
    )
  }
  return (
    <span className={`tag tag--${tone}`}>#{tag}</span>
  )
}

/* ── Feed Card ── */
function FeedCard({
  item,
  active,
  onClick,
}: {
  item: FeedItem
  active: boolean
  onClick: () => void
}) {
  const featured = active && item.accent === 'gradient'

  // Spring animation variants for staggered load
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 350,
        damping: 25
      }
    }
  }

  return (
    <motion.article
      variants={itemVariants}
      whileHover={{ y: -2, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
      whileTap={{ scale: 0.98 }}
      className={`inbox-card p-3.5 ${active ? 'selected' : ''} ${featured ? 'card-featured' : ''}`}
      onClick={onClick}
      style={{
        borderColor: active && !featured ? 'rgba(139,92,246,.38)' : undefined,
      }}
    >
      <header className="flex items-center gap-2.5 mb-1.5">
        <HaloAvatar initials={item.initials} accent={item.accent} src={item.avatar} size={34} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-white truncate">{item.name}</span>
            <span className="text-[11.5px] whitespace-nowrap ml-2" style={{ color: featured ? 'rgba(255,255,255,0.7)' : 'var(--tx-ink-muted)' }}>{item.when}</span>
          </div>
        </div>
        {item.tag && <TagBadge tag={item.tag} tone={item.tagTone ?? 'violet'} />}
      </header>
      <p className="text-[12.5px] leading-[1.45] line-clamp-2" style={{ color: featured ? 'rgba(255,255,255,0.92)' : 'var(--tx-ink-secondary)' }}>
        {item.snippet}
      </p>
      
      {(item.draft || item.count) && (
        <div className="flex items-center justify-between mt-2.5 gap-2">
          {item.draft ? (
            <div className="card__draft mt-0 flex-1 flex items-center gap-2 py-1 px-2 overflow-hidden">
              <span className="draft-pill shrink-0">
                <PenSquare size={10} />
                Borrador
              </span>
              <span className="draft-text truncate text-[11.5px] leading-none" style={{ color: featured ? 'rgba(255,255,255,0.8)' : 'var(--tx-ink-secondary)' }}>
                {item.draft}
              </span>
            </div>
          ) : <div className="flex-1" />}
          {item.count && (
            <span className="text-[10px] font-semibold bg-white/10 text-white/70 px-2 py-0.5 rounded-full border border-white/5 shrink-0">
              {item.count}
            </span>
          )}
        </div>
      )}
    </motion.article>
  )
}

/* ── Main Feed ── */
interface DashFeedProps {
  items: FeedItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  title?: string
}

const TABS = [
  { id: 'all',           label: 'Todos' },
  { id: 'sin_contactar', label: 'Sin contactar' },
]

export function DashFeed({ items, selectedId, onSelect, title = 'Feed' }: DashFeedProps) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = items
    if (filter === 'sin_contactar') list = items.filter(i => i.unread)
    if (search) list = list.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.snippet.toLowerCase().includes(search.toLowerCase())
    )
    return list
  }, [items, filter, search])

  return (
    <section className="glass flex flex-col" style={{ padding: '14px', overflow: 'hidden', minWidth: 0 }}>
      {/* Search bar */}
      <div className="feed__top">
        <label className="search">
          <Search size={14} />
          <input
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>

      {/* Filtros */}
      <div className="feed__tabs">
        {TABS.map(t => (
          <motion.button
            key={t.id}
            aria-pressed={filter === t.id}
            className={`tab ${filter === t.id ? 'is-active' : ''}`}
            onClick={() => setFilter(t.id)}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          >
            {t.label}
          </motion.button>
        ))}
        <span className="feed__count">{filtered.length}</span>
      </div>

      {/* List */}
      <motion.div
        key={filter} // Forces stagger transition when active tab changes
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.03
            }
          }
        }}
        initial="hidden"
        animate="show"
        className="flex-1 overflow-y-auto flex flex-col gap-2"
        style={{ paddingRight: 4, marginRight: -4 }}
      >
        {filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: 'var(--tx-ink-muted)' }}>
            Sin resultados
          </div>
        ) : (
          filtered.map(item => (
            <FeedCard
              key={item.id}
              item={item}
              active={item.id === selectedId}
              onClick={() => onSelect(item.id)}
            />
          ))
        )}
      </motion.div>
    </section>
  )
}
