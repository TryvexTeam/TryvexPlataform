import { ScoopCard } from '@/components/dashboard/scoop-card'
import { ScoreLead } from '@/components/dashboard/score-lead'
import type { Lead } from '@/lib/types/lead'

/**
 * Tarjeta de lead sin contactar.
 *
 * Muestra lo justo para decidir a quién llamar primero: quién es, de dónde
 * salió y qué tan caliente lo ve la IA. Todo lo demás vive en la ficha.
 */

interface LeadScoopCardProps {
  lead: Pick<Lead, 'id' | 'nombre_negocio' | 'nicho' | 'localidad' | 'score' | 'origen'>
  /** Posición en la lista: escalona la entrada y el llenado del score. */
  indice?: number
}

const ORIGEN_LABEL: Record<Lead['origen'], string> = {
  scraper: 'Scraper',
  manual: 'Carga manual',
  referido: 'Referido',
}

/** Iniciales del negocio para el avatar: dos letras, sin fotos que no tenemos. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? '')
    .join('')
}

export function LeadScoopCard({ lead, indice = 0 }: LeadScoopCardProps) {
  const subtitulo = [lead.nicho, lead.localidad].filter(Boolean).join(' · ')

  return (
    <ScoopCard
      href={`/leads/${lead.id}`}
      accion={`Abrir ${lead.nombre_negocio}`}
      indice={indice}
      className="flex h-full flex-col p-5"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.06] text-[13px] font-medium text-[var(--tx-ink-secondary)]">
        {iniciales(lead.nombre_negocio)}
      </div>

      <p className="mt-5 truncate pr-12 text-[17px] font-medium tracking-[-0.015em] text-[var(--tx-ink-primary)]">
        {lead.nombre_negocio}
      </p>
      <p className="mt-1.5 truncate text-[12.5px] text-[var(--tx-ink-secondary)]">
        {subtitulo || 'Sin nicho ni localidad'}
      </p>

      <div className="mb-5 mt-5 h-px bg-white/[0.06]" aria-hidden="true" />

      <ScoreLead score={lead.score} indice={indice} />

      <div className="mt-auto pt-4">
        <span className="inline-flex h-[26px] items-center rounded-full border border-white/[0.10] px-2.5 text-[11.5px] font-medium text-[var(--tx-ink-secondary)]">
          {ORIGEN_LABEL[lead.origen]}
        </span>
      </div>
    </ScoopCard>
  )
}
