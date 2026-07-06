'use client'

import type { Lead } from '@/lib/types/lead'

const CATEGORIES: { id: Lead['estado'] | 'todos'; label: string }[] = [
  { id: 'todos',            label: 'Todos'            },
  { id: 'sin_contactar',    label: 'Sin contactar'    },
  { id: 'contactado',       label: 'Contactado'       },
  { id: 'interesado',       label: 'Interesado'       },
  { id: 'reunion_agendada', label: 'Reunión agendada' },
  { id: 'ganado',           label: 'Ganado'           },
  { id: 'perdido',          label: 'Perdido'          },
  { id: 'descartado',       label: 'Descartado'       },
]

const INBOX_CATS  = CATEGORIES.filter(c => c.id === 'todos')
const ESTADO_CATS = CATEGORIES.filter(c => c.id !== 'todos')

interface LeadsCategoriesProps {
  leads: Lead[]
  activeEstado: Lead['estado'] | 'todos'
  onSelect: (estado: Lead['estado'] | 'todos') => void
}

export function LeadsCategories({ leads, activeEstado, onSelect }: LeadsCategoriesProps) {
  const counts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.estado] = (acc[l.estado] ?? 0) + 1
    return acc
  }, {})
  const total = leads.length

  function renderItem(cat: typeof CATEGORIES[number]) {
    const count = cat.id === 'todos' ? total : (counts[cat.id] ?? 0)
    const isActive = activeEstado === cat.id

    return (
      <button
        key={cat.id}
        onClick={() => onSelect(cat.id)}
        className={`leads-categories__item ${isActive ? 'is-active' : ''}`}
      >
        <span className="leads-categories__left">
          <span className="truncate">{cat.label}</span>
        </span>
        {count > 0 && (
          <span className="leads-categories__count">{count}</span>
        )}
      </button>
    )
  }

  return (
    <nav className="leads-categories">
      <span className="leads-categories__title">INBOX</span>
      {INBOX_CATS.map(renderItem)}

      <div className="leads-categories__divider" />
      <span className="leads-categories__title">ESTADO</span>
      {ESTADO_CATS.map(renderItem)}
    </nav>
  )
}
