'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, List, Kanban, Search } from 'lucide-react'
import { toast } from '@/lib/toast'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { LeadCard } from './lead-card'
import { LeadForm } from './lead-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'
import { useWaNoLeidos } from '@/lib/hooks/use-wa-no-leidos'
import type { Lead, LeadInsert } from '@/lib/types/lead'
import { ESTADOS_LEAD } from '@/lib/types/lead'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface LeadsPipelineProps {
  initialLeads: Lead[]
}

export function LeadsPipeline({ initialLeads }: LeadsPipelineProps) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [vista, setVista] = useState<'kanban' | 'tabla'>('kanban')
  const [formOpen, setFormOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { setLeads(initialLeads) }, [initialLeads])

  // `fact_leads` tampoco estaba publicada: el canal decía SUBSCRIBED sin recibir nada.
  useDatosVivos(['fact_leads', 'interacciones_lead'])
  // Quien escribio y todavia no le contestamos. Se pinta en la tarjeta.
  const { noLeidos } = useWaNoLeidos()

  const leadsFiltrados = useMemo(
    () => leads.filter((l) => l.nombre_negocio.toLowerCase().includes(search.toLowerCase())),
    [leads, search],
  )

  const columns = useMemo(
    () => ESTADOS_LEAD.map((e) => ({
      id: e.id,
      title: e.label,
      color: e.color,
      items: leadsFiltrados.filter((l) => l.estado === e.id),
    })),
    [leadsFiltrados],
  )

  async function patchEstado(
    itemId: string,
    estado: Lead['estado'],
    anterior: Lead | undefined,
    razonPerdida?: string,
  ) {
    const res = await fetch(`/api/leads/${itemId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, razon_perdida: razonPerdida }),
    })
    if (!res.ok) {
      toast.error('Error al mover el lead')
      // Revertir solo ESTA tarjeta, y solo si sigue en el estado optimista que
      // puso esta llamada: `setLeads(initialLeads)` pisaba cambios de OTROS
      // leads ya confirmados en el servidor mientras esta petición volaba.
      if (anterior) {
        setLeads((p) => p.map((l) => (l.id === itemId && l.estado === estado ? anterior : l)))
      }
    }
  }

  async function handleDragEnd(itemId: string, _from: string, toCol: string) {
    const estado = toCol as Lead['estado']
    const anterior = leads.find((l) => l.id === itemId)
    setLeads((p) => p.map((l) => l.id === itemId ? { ...l, estado } : l))

    await patchEstado(itemId, estado, anterior)

    // El toast de sileo solo tiene un botón (ver lib/toast.ts), así que no
    // alcanza para el selector completo de RAZONES_PERDIDA que ya tiene la
    // ficha (lead-panel.tsx). En vez de duplicar esa lista acá, se manda a
    // abrirla ahí: sin esto, arrastrar la tarjeta era la única vía de
    // leads.cambiarEstado que nunca guardaba razon_perdida.
    if (estado === 'perdido') {
      toast('Lead marcado como perdido', {
        description: 'Registrá el motivo en la ficha del lead',
        action: { label: 'Abrir ficha', onClick: () => router.push(`/leads/${itemId}`) },
      })
    }
  }

  async function handleCreate(data: LeadInsert) {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Lead creado')
    router.refresh()
  }

  const handleCardClick = useCallback((id: string) => router.push(`/leads/${id}`), [router])

  const renderCard = useCallback(
    (lead: Lead) => (
      <LeadCard
        lead={lead}
        noLeidos={noLeidos[lead.id]}
        onClick={() => handleCardClick(lead.id)}
      />
    ),
    [noLeidos, handleCardClick],
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Leads</h1>
          <p className="text-sm text-[var(--tx-ink-muted)] mt-0.5">{leads.length} leads en total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={vista === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setVista('kanban')}>
            <Kanban size={14} className="mr-1.5" />
            Pipeline
          </Button>
          <Button variant={vista === 'tabla' ? 'default' : 'outline'} size="sm" onClick={() => setVista('tabla')}>
            <List size={14} className="mr-1.5" />
            Tabla
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            Nuevo lead
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-ink-muted)]" />
        <Input
          className="pl-8"
          placeholder="Buscar negocio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {vista === 'kanban' ? (
        <KanbanBoard
          columns={columns}
          renderCard={renderCard}
          onDragEnd={handleDragEnd}
        />
      ) : (
        <TablaLeads leads={leadsFiltrados} onRowClick={(id) => router.push(`/leads/${id}`)} />
      )}

      <LeadForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </div>
  )
}

function TablaLeads({ leads, onRowClick }: { leads: Lead[]; onRowClick: (id: string) => void }) {
  return (
    <div className="rounded-lg border border-[var(--tx-border)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--tx-surface-1)] border-b border-[var(--tx-border)]">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-[var(--tx-ink-secondary)]">Negocio</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--tx-ink-secondary)] hidden md:table-cell">Nicho</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--tx-ink-secondary)] hidden md:table-cell">Localidad</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--tx-ink-secondary)]">Estado</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--tx-ink-secondary)] hidden lg:table-cell">Origen</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--tx-ink-secondary)] hidden lg:table-cell">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--tx-border)]">
          {leads.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--tx-ink-muted)]">Sin leads</td></tr>
          )}
          {leads.map((l) => {
            const estadoConf = ESTADOS_LEAD.find((e) => e.id === l.estado)
            return (
              <tr
                key={l.id}
                onClick={() => onRowClick(l.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick(l.id)
                  }
                }}
                className="hover:bg-[var(--tx-surface-1)] cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-[var(--tx-ink-primary)]">{l.nombre_negocio}</td>
                <td className="px-4 py-3 text-[var(--tx-ink-muted)] hidden md:table-cell">{l.nicho ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--tx-ink-muted)] hidden md:table-cell">{l.localidad ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--tx-ink-primary)]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: estadoConf?.color }} />
                    {estadoConf?.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--tx-ink-muted)] hidden lg:table-cell capitalize">{l.origen}</td>
                <td className="px-4 py-3 text-[var(--tx-ink-muted)] hidden lg:table-cell">{l.score ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
