import { Globe, Phone, MapPin, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Lead } from '@/lib/types/lead'
import { cn } from '@/lib/utils'

const origenConfig = {
  scraper: { label: 'Scraper', class: 'bg-blue-50 text-blue-600' },
  manual: { label: 'Manual', class: 'bg-neutral-50 text-neutral-600' },
  referido: { label: 'Referido', class: 'bg-green-50 text-green-600' },
}

interface LeadCardProps {
  lead: Lead
  onClick?: () => void
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-neutral-200 p-3 cursor-pointer hover:border-neutral-300 hover:shadow-sm transition-all select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-neutral-800 leading-snug line-clamp-2">
          {lead.nombre_negocio}
        </p>
        {lead.score && (
          <span className="flex items-center gap-0.5 text-xs text-amber-500 shrink-0 font-medium">
            <Star size={11} fill="currentColor" />
            {lead.score}
          </span>
        )}
      </div>

      <div className="space-y-1 mb-2">
        {lead.nicho && (
          <p className="text-xs text-neutral-500 truncate">{lead.nicho}</p>
        )}
        {lead.localidad && (
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <MapPin size={10} />
            {lead.localidad}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', origenConfig[lead.origen].class)}>
          {origenConfig[lead.origen].label}
        </span>
        <div className="flex items-center gap-1.5">
          {lead.telefono && <Phone size={11} className="text-neutral-300" />}
          {lead.tiene_web && <Globe size={11} className="text-neutral-300" />}
        </div>
      </div>
    </div>
  )
}
