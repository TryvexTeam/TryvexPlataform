'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, List, Kanban, Search } from 'lucide-react'
import { toast } from 'sonner'
import { KanbanBoard } from '@/components/shared/kanban-board'
import { LeadCard } from './lead-card'
import { LeadForm } from './lead-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
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

  // Realtime
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fact_leads' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [router])

  const leadsFiltrados = leads.filter((l) =>
    l.nombre_negocio.toLowerCase().includes(search.toLowerCase())
  )

  const columns = ESTADOS_LEAD.map((e) => ({
    id: e.id,
    title: e.label,
    color: e.color,
    items: leadsFiltrados.filter((l) => l.estado === e.id),
  }))

  async function handleDragEnd(itemId: string, _from: string, toCol: string) {
    const estado = toCol as Lead['estado']
    setLeads((p) => p.map((l) => l.id === itemId ? { ...l, estado } : l))

    const res = await fetch(`/api/leads/${itemId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) {
      toast.error('Error al mover el lead')
      setLeads(initialLeads)
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Leads</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{leads.length} leads en total</p>
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
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
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
          renderCard={(lead) => (
            <LeadCard lead={lead} onClick={() => router.push(`/leads/${lead.id}`)} />
          )}
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
    <div className="rounded-lg border border-neutral-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 border-b border-neutral-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-neutral-600">Negocio</th>
            <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden md:table-cell">Nicho</th>
            <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden md:table-cell">Localidad</th>
            <th className="text-left px-4 py-3 font-medium text-neutral-600">Estado</th>
            <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden lg:table-cell">Origen</th>
            <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden lg:table-cell">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {leads.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Sin leads</td></tr>
          )}
          {leads.map((l) => {
            const estadoConf = ESTADOS_LEAD.find((e) => e.id === l.estado)
            return (
              <tr key={l.id} onClick={() => onRowClick(l.id)} className="hover:bg-neutral-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-neutral-800">{l.nombre_negocio}</td>
                <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{l.nicho ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{l.localidad ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: estadoConf?.color }} />
                    {estadoConf?.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell capitalize">{l.origen}</td>
                <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">{l.score ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
