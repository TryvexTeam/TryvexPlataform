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
        className="leads-categories__item"
        // El activo va en blanco, no en acento: el rojo de la marca queda
        // reservado para lo que exige atención (mensajes sin leer, urgencias),
        // y un filtro seleccionado no es una alerta.
        style={
          isActive
            ? { background: '#fff', color: 'var(--tx-bg-primary)', borderColor: '#fff', fontWeight: 500 }
            : { background: 'transparent', color: 'var(--tx-ink-secondary)', borderColor: 'rgba(255,255,255,.09)' }
        }
        /* El hover va por JS y no por CSS porque los estilos en línea de arriba
           le ganan a la regla `:hover` de la hoja: dejarlo en CSS hacía que el
           ítem no reaccionara al puntero. */
        onMouseEnter={e => {
          if (isActive) return
          const e0 = e.currentTarget as HTMLElement
          e0.style.color = 'var(--tx-ink-primary)'
          e0.style.background = 'rgba(255,255,255,.05)'
        }}
        onMouseLeave={e => {
          if (isActive) return
          const e0 = e.currentTarget as HTMLElement
          e0.style.color = 'var(--tx-ink-secondary)'
          e0.style.background = 'transparent'
        }}
      >
        <span className="leads-categories__left">
          <span className="truncate">{cat.label}</span>
        </span>
        {count > 0 && (
          <span
            className="leads-categories__count"
            style={{ color: isActive ? 'rgba(15,15,20,.55)' : 'var(--tx-ink-muted)' }}
          >
            {count}
          </span>
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
