'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
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

/**
 * Los filtros de la lista, aparte del texto y del estado.
 *
 * Se eligieron por lo que de verdad ayuda a decidir a quién llamar primero:
 *  · nicho — agrupar por rubro para hacer tandas del mismo tipo de negocio.
 *  · rating alto / muchas reseñas — negocios establecidos que cuidan su imagen.
 *  · con teléfono — sin número no hay llamada en frío.
 *  · con Instagram — activos en redes, mejor gancho ("ya tienes IG, te falta web").
 *  · sin asignar — los que nadie del equipo tomó, para no pisarse.
 * "Sin web" NO es filtro: hoy TODOS los leads del scraper vienen sin web, así
 * que separaría nada. Si algún día entran con web, se agrega.
 */
interface Filtros {
  nichos: Set<string>
  ratingAlto: boolean
  muchasResenas: boolean
  conTelefono: boolean
  conInstagram: boolean
  sinAsignar: boolean
}

const FILTROS_VACIOS: Filtros = {
  nichos: new Set(),
  ratingAlto: false,
  muchasResenas: false,
  conTelefono: false,
  conInstagram: false,
  sinAsignar: false,
}

const RATING_MIN = 4.5
const RESENAS_MIN = 100

export function LeadsInbox({ leads, selectedId, asignaciones = {} }: LeadsInboxProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [panelAbierto, setPanelAbierto] = useState(false)
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

  // Los rubros que la cartera ya tiene, ordenados por cuántos leads hay de cada
  // uno (los más numerosos primero: son los que más conviene filtrar). Sirve
  // para el panel de filtros y para el buscador de más leads.
  const nichosConteo = useMemo(() => {
    const c = new Map<string, number>()
    for (const l of leads) if (l.nicho) c.set(l.nicho, (c.get(l.nicho) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
  }, [leads])
  const nichosDisponibles = useMemo(
    () => [...nichosConteo].map(([n]) => n).sort((a, b) => a.localeCompare(b, 'es')),
    [nichosConteo],
  )

  const filtrosActivos =
    filtros.nichos.size +
    (filtros.ratingAlto ? 1 : 0) +
    (filtros.muchasResenas ? 1 : 0) +
    (filtros.conTelefono ? 1 : 0) +
    (filtros.conInstagram ? 1 : 0) +
    (filtros.sinAsignar ? 1 : 0)

  const q = search.trim().toLowerCase()
  const filtered = leads.filter((l) => {
    if (q && !(
      l.nombre_negocio.toLowerCase().includes(q) ||
      (l.nicho ?? '').toLowerCase().includes(q) ||
      (l.localidad ?? '').toLowerCase().includes(q)
    )) return false
    if (filtros.nichos.size > 0 && !(l.nicho && filtros.nichos.has(l.nicho))) return false
    if (filtros.ratingAlto && (l.google_rating ?? 0) < RATING_MIN) return false
    if (filtros.muchasResenas && (l.google_resenas ?? 0) < RESENAS_MIN) return false
    if (filtros.conTelefono && !l.telefono) return false
    if (filtros.conInstagram && !l.instagram) return false
    if (filtros.sinAsignar && (asignaciones[l.id]?.length ?? 0) > 0) return false
    return true
  })

  const toggleNicho = (n: string) =>
    setFiltros((f) => {
      const nichos = new Set(f.nichos)
      if (nichos.has(n)) nichos.delete(n)
      else nichos.add(n)
      return { ...f, nichos }
    })
  const toggleFlag = (k: keyof Omit<Filtros, 'nichos'>) =>
    setFiltros((f) => ({ ...f, [k]: !f[k] }))
  const limpiarFiltros = () => setFiltros(FILTROS_VACIOS)

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
      <div className="feed__top" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label className="search" style={{ flex: 1 }}>
          <Search size={14} className="shrink-0" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar leads, nichos, comunas..."
          />
          <kbd>Ctrl+K</kbd>
        </label>
        <button
          onClick={() => setPanelAbierto((v) => !v)}
          title="Filtros"
          aria-label="Filtros"
          aria-pressed={panelAbierto}
          className="relative shrink-0 grid place-items-center h-9 w-9 rounded-xl border transition-colors"
          style={{
            borderColor: filtrosActivos > 0 ? 'var(--tx-accent)' : 'rgba(255,255,255,.08)',
            background: filtrosActivos > 0 ? 'color-mix(in oklab, var(--tx-accent) 14%, transparent)' : 'rgba(255,255,255,.02)',
            color: filtrosActivos > 0 ? 'var(--tx-accent)' : 'var(--tx-ink-secondary)',
          }}
        >
          <SlidersHorizontal size={15} />
          {filtrosActivos > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full text-[10px] font-bold"
              style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
            >
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {/* Panel de filtros */}
      {panelAbierto && (
        <div className="px-3 pb-3 pt-1 border-b border-white/[0.06] space-y-3">
          {/* Filtros de calidad / estado del dato */}
          <div className="flex flex-wrap gap-1.5">
            <ChipFiltro activo={filtros.ratingAlto} onClick={() => toggleFlag('ratingAlto')}>
              ★ {RATING_MIN}+
            </ChipFiltro>
            <ChipFiltro activo={filtros.muchasResenas} onClick={() => toggleFlag('muchasResenas')}>
              {RESENAS_MIN}+ reseñas
            </ChipFiltro>
            <ChipFiltro activo={filtros.conTelefono} onClick={() => toggleFlag('conTelefono')}>
              Con teléfono
            </ChipFiltro>
            <ChipFiltro activo={filtros.conInstagram} onClick={() => toggleFlag('conInstagram')}>
              Con Instagram
            </ChipFiltro>
            <ChipFiltro activo={filtros.sinAsignar} onClick={() => toggleFlag('sinAsignar')}>
              Sin asignar
            </ChipFiltro>
          </div>

          {/* Nichos */}
          {nichosConteo.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--tx-ink-muted)] mb-1.5">
                Rubro
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {nichosConteo.map(([n, cnt]) => (
                  <ChipFiltro key={n} activo={filtros.nichos.has(n)} onClick={() => toggleNicho(n)}>
                    {n} <span className="opacity-50">{cnt}</span>
                  </ChipFiltro>
                ))}
              </div>
            </div>
          )}

          {filtrosActivos > 0 && (
            <button
              onClick={limpiarFiltros}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
            >
              <X size={12} /> Limpiar filtros ({filtrosActivos})
            </button>
          )}
        </div>
      )}

      {/* Contador + traer leads nuevos */}
      <div className="feed__chips" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="feed__count">
          {filtered.length} {filtrosActivos > 0 || q ? `de ${leads.length}` : 'leads'}
        </span>
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
            {(search !== '' || filtrosActivos > 0) && (
              <button
                onClick={() => { setSearch(''); limpiarFiltros() }}
                className="mt-1 text-[12px] px-3 py-1.5 rounded-lg border border-white/10 text-white/70"
              >
                Limpiar búsqueda y filtros
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

/** Un chip on/off del panel de filtros. Verde de acento cuando está activo. */
function ChipFiltro({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
      style={{
        borderColor: activo ? 'transparent' : 'rgba(255,255,255,.08)',
        background: activo ? 'var(--tx-accent)' : 'rgba(255,255,255,.02)',
        color: activo ? 'var(--tx-accent-fg)' : 'var(--tx-ink-secondary)',
      }}
    >
      {children}
    </button>
  )
}
