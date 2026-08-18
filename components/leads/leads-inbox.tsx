'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import type { Lead } from '@/lib/types/lead'
import type { AsignacionConIntegrante } from '@/lib/types/asignacion'
import { AvatarStack } from '@/components/shared/avatar-stack'
import { hashColorHex, getInitials, relativeTime } from '@/lib/utils/lead-utils'
import { ScraperPanel } from './scraper-panel'
import { useWaNoLeidos } from '@/lib/hooks/use-wa-no-leidos'

const estadoConfig: Record<Lead['estado'], { label: string; dot: string }> = {
  sin_contactar:    { label: 'Sin contactar',   dot: 'oklch(63% 0.008 240)' },
  contactado:       { label: 'Contactado',       dot: 'oklch(68% 0.18 230)' },
  interesado:       { label: 'Interesado',       dot: 'oklch(74% 0.17 55)' },
  reunion_agendada: { label: 'Reunión agendada', dot: 'oklch(65% 0.22 292)' },
  ganado:           { label: 'Ganado',           dot: 'oklch(72% 0.17 145)' },
  perdido:          { label: 'Perdido',          dot: 'oklch(63% 0.21 22)' },
  descartado:       { label: 'Descartado',       dot: 'oklch(55% 0.01 240)' },
}

function LeadAvatar({
  initials,
  accent,
  size = 32,
  noLeidos = 0,
}: {
  initials: string
  accent: string
  size?: number
  /** Entrantes de WhatsApp sin responder. 0 = sin globito. */
  noLeidos?: number
}) {
  const bg = accent === 'gradient'
    ? 'linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%)'
    : `linear-gradient(135deg, ${accent}, ${accent}cc)`
  return (
    <div style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: bg,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontSize: size * 0.36,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          boxShadow: '0 6px 16px rgba(0,0,0,.45)',
        }}
      >
        {initials}
      </div>
      {noLeidos > 0 && (
        // Encima del avatar y no al lado del nombre: es el lugar donde la gente
        // ya mira sin que nadie le explique, por WhatsApp y por todo lo demas.
        <span
          title={`${noLeidos} mensaje${noLeidos === 1 ? '' : 's'} de WhatsApp sin responder`}
          aria-label={`${noLeidos} mensaje${noLeidos === 1 ? '' : 's'} de WhatsApp sin responder`}
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 999,
            background: 'oklch(72% 0.17 145)',
            color: '#04140b',
            fontSize: 10,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
            border: '2px solid oklch(10% 0.004 240)',
            boxShadow: '0 2px 6px rgba(0,0,0,.5)',
          }}
        >
          {noLeidos > 9 ? '9+' : noLeidos}
        </span>
      )}
    </div>
  )
}

interface LeadsInboxProps {
  leads: Lead[]
  selectedId: string | null
  /** Asignados por `lead_id`, en UN lote (`AsignacionesRepository.asignacionesDeLeads`).
   *  La página los consulta de una vez: pedirlos por fila sería el N+1 con 541 leads. */
  asignaciones?: Record<string, AsignacionConIntegrante[]>
}

export function LeadsInbox({ leads, selectedId, asignaciones = {} }: LeadsInboxProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Quien escribio por WhatsApp y sigue sin respuesta.
  const { noLeidos } = useWaNoLeidos()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // El filtro por estado vive en la columna de categorías (un solo sistema de filtros)
  const filtered = leads.filter((l) => {
    return (
      !search ||
      l.nombre_negocio.toLowerCase().includes(search.toLowerCase()) ||
      (l.nicho ?? '').toLowerCase().includes(search.toLowerCase())
    )
  })

  // Los rubros que la cartera ya tiene: se le ofrecen al que va a buscar mas,
  // para que no los escriba de memoria y termine con "barberias" y "barberia"
  // como si fueran dos rubros distintos.
  const nichosDisponibles = Array.from(
    new Set(leads.map(l => l.nicho).filter((n): n is string => Boolean(n))),
  ).sort((a, b) => a.localeCompare(b, 'es'))

  const featuredId = (() => {
    if (filtered.length === 0) return null
    const withScore = filtered.filter(l => l.score != null)
    if (withScore.length > 0) return withScore.reduce((a, b) => (b.score! > a.score! ? b : a)).id
    return filtered[0].id
  })()

  const select = (id: string) => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('lead') === id) {
      params.delete('lead')
    } else {
      params.set('lead', id)
    }
    router.replace(`/leads?${params.toString()}`, { scroll: false })
  }

  return (
    <section className="glass feed w-[360px] shrink-0 flex flex-col h-full">
      {/* Search Header */}
      <div className="feed__top">
        <label className="search">
          <Search size={14} className="shrink-0" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar leads, nichos..."
          />
          <kbd>Ctrl+K</kbd>
        </label>
      </div>

      {/* Contador + traer leads nuevos */}
      <div className="feed__chips" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="feed__count">{filtered.length} leads</span>
        <span style={{ marginLeft: 'auto' }}>
          <ScraperPanel nichos={nichosDisponibles} />
        </span>
      </div>

      {/* Feed List */}
      <div className="feed__list">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-[13px] text-[var(--tx-ink-muted)]">
            <span style={{ fontSize: 28, opacity: 0.3 }}>📭</span>
            Sin leads que coincidan
            <button
              onClick={() => router.push('/leads?nuevo=1')}
              className="mt-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
            >
              + Nuevo lead
            </button>
            {search !== '' && (
              <button
                onClick={() => setSearch('')}
                className="mt-1 text-[12px] px-3 py-1.5 rounded-lg border border-white/10 text-white/70"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}
        {filtered.map((lead) => {
          const isSelected = lead.id === selectedId
          const isFeatured = lead.id === featuredId
          const initials = getInitials(lead.nombre_negocio)
          const avatarColor = hashColorHex(lead.nombre_negocio)
          const cfg = estadoConfig[lead.estado]

          return (
            <button
              key={lead.id}
              onClick={() => select(lead.id)}
              className={`inbox-card w-full text-left cursor-pointer ${isSelected ? 'selected' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <LeadAvatar
                  initials={initials}
                  accent={isFeatured ? 'gradient' : avatarColor}
                  size={32}
                  noLeidos={noLeidos[lead.id]}
                />
                <div className="flex-1 min-w-0">
                  {/* Fila 1: nombre + timestamp */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[var(--tx-ink-primary)] truncate leading-tight">
                      {lead.nombre_negocio}
                    </span>
                    <span className="text-[10px] text-[var(--tx-ink-muted)] shrink-0">
                      {relativeTime(lead.created_at)}
                    </span>
                  </div>
                  {/* Fila 2: snippet + estado pill derecha */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[12px] text-[var(--tx-ink-muted)] leading-tight truncate min-w-0">
                      {lead.info_texto || lead.nicho || 'Sin descripción'}
                    </p>
                    <span
                      className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: `${cfg.dot}22`,
                        color: cfg.dot,
                        border: `1px solid ${cfg.dot}44`,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  {/* Fila 3: quién tiene este lead. Abajo a la derecha, como en
                      las tarjetas de tareas. Si no hay asignados no se pinta
                      nada — el propio AvatarStack devuelve null. */}
                  {(asignaciones[lead.id]?.length ?? 0) > 0 && (
                    <div className="flex justify-end mt-1">
                      <AvatarStack asignados={asignaciones[lead.id]} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
