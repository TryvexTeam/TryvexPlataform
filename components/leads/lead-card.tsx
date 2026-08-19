import { Globe, Phone, MapPin, Star } from 'lucide-react'
import type { Lead } from '@/lib/types/lead'

const origenConfig = {
  scraper: { label: 'Scraper', style: { background: 'oklch(68% 0.18 230 / 12%)', color: 'oklch(75% 0.14 230)', border: '1px solid oklch(68% 0.18 230 / 25%)' } },
  manual:  { label: 'Manual',  style: { background: 'oklch(100% 0 0 / 5%)',       color: 'oklch(65% 0 0)',      border: '1px solid oklch(100% 0 0 / 10%)' } },
  referido:{ label: 'Referido',style: { background: 'oklch(72% 0.17 145 / 12%)', color: 'oklch(78% 0.14 145)', border: '1px solid oklch(72% 0.17 145 / 25%)' } },
}

interface LeadCardProps {
  lead: Lead
  onClick?: () => void
  /** Entrantes de WhatsApp sin leer. 0 o ausente = no se muestra nada. */
  noLeidos?: number
}

export function LeadCard({ lead, onClick, noLeidos = 0 }: LeadCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-3 cursor-pointer select-none transition-all duration-150 group"
      style={{
        background: 'oklch(10% 0.004 240)',
        border: '1px solid var(--tx-border)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.border = '1px solid oklch(100% 0 0 / 12%)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.border = '1px solid var(--tx-border)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p
          className="text-[13px] font-semibold leading-snug line-clamp-2"
          style={{ color: 'var(--tx-ink-primary)' }}
        >
          {lead.nombre_negocio}
        </p>
        {noLeidos > 0 && (
          // Verde WhatsApp y arriba del score: es lo unico de la tarjeta que
          // pide una accion HOY — alguien escribio y nadie contesto.
          <span
            className="flex items-center gap-1 text-[11px] shrink-0 font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: 'oklch(72% 0.17 145 / 15%)',
              color: 'oklch(80% 0.15 145)',
              border: '1px solid oklch(72% 0.17 145 / 30%)',
            }}
            title={`${noLeidos} mensaje${noLeidos === 1 ? '' : 's'} de WhatsApp sin leer`}
            aria-label={`${noLeidos} mensaje${noLeidos === 1 ? '' : 's'} de WhatsApp sin leer`}
          >
            💬 {noLeidos}
          </span>
        )}
      </div>

      {/*
        El score de IA decide a quién llamar primero, así que va como cifra +
        barra, no como un número perdido entre otros datos. Sin score no es
        "cero" (eso se leería como "pésimo"): es un guion, porque significa
        que todavía nadie lo calificó.
      */}
      <div className="flex items-center gap-1.5 mb-2">
        <Star size={10} style={{ color: lead.score && lead.score >= 8 ? 'var(--tx-accent-2)' : 'var(--tx-ink-muted)' }} fill="currentColor" />
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
          {lead.score && (
            <div
              className="h-full rounded-full"
              style={{
                width: `${(lead.score / 10) * 100}%`,
                background: lead.score >= 8 ? 'var(--tx-accent)' : 'rgba(255,255,255,.34)',
              }}
            />
          )}
        </div>
        <span
          className="text-[11px] font-medium shrink-0 tabular-nums"
          style={{ color: lead.score ? (lead.score >= 8 ? 'var(--tx-accent-2)' : 'var(--tx-ink-primary)') : 'var(--tx-ink-muted)' }}
        >
          {lead.score ?? '—'}
        </span>
      </div>

      <div className="space-y-1 mb-2.5">
        {lead.nicho && (
          <p className="text-[11px] truncate" style={{ color: 'var(--tx-ink-secondary)' }}>
            {lead.nicho}
          </p>
        )}
        {lead.localidad && (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--tx-ink-muted)' }}>
            <MapPin size={9} />
            {lead.localidad}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={origenConfig[lead.origen].style}
        >
          {origenConfig[lead.origen].label}
        </span>
        <div className="flex items-center gap-2">
          {lead.telefono && (
            <Phone size={11} style={{ color: 'var(--tx-ink-muted)' }} />
          )}
          {lead.tiene_web && (
            <Globe size={11} style={{ color: 'var(--tx-ink-muted)' }} />
          )}
        </div>
      </div>
    </div>
  )
}
