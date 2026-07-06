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
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
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
        {lead.score && (
          <span
            className="flex items-center gap-0.5 text-[11px] shrink-0 font-medium"
            style={{ color: 'oklch(74% 0.17 55)' }}
          >
            <Star size={10} fill="currentColor" />
            {lead.score}
          </span>
        )}
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
