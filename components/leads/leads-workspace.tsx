'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/lib/toast'
import { LeadsInbox } from './leads-inbox'
import { LeadPanel } from './lead-panel'
import { LeadTaskPanel } from './lead-task-panel'
import { LeadsCategories } from './leads-categories'
import { LeadForm } from './lead-form'
import type { Lead, Interaccion, LeadInsert } from '@/lib/types/lead'
import type { AsignacionConIntegrante } from '@/lib/types/asignacion'

interface LeadsWorkspaceProps {
  leads: Lead[]
  selectedId: string | null
  interacciones: Interaccion[]
  /** Asignados por `lead_id`, consultados en lote por la página. */
  asignaciones?: Record<string, AsignacionConIntegrante[]>
}

export function LeadsWorkspace({
  leads,
  selectedId,
  interacciones,
  asignaciones = {},
}: LeadsWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(searchParams.get('nuevo') === '1')

  function handleCloseForm(open: boolean) {
    if (!open) {
      setFormOpen(false)
      const params = new URLSearchParams(window.location.search)
      params.delete('nuevo')
      router.replace(`/leads?${params.toString()}`, { scroll: false })
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
    handleCloseForm(false)
    router.refresh()
  }
  const [activeEstado, setActiveEstado] = useState<Lead['estado'] | 'todos'>('todos')

  const selectedLead = selectedId ? (leads.find(l => l.id === selectedId) ?? null) : null

  const filteredLeads = activeEstado === 'todos'
    ? leads
    : leads.filter(l => l.estado === activeEstado)

  return (
    <div
      className={`leads-workspace relative h-full transition-all duration-300 ${
        selectedLead ? 'has-lead' : ''
      } ${isTaskPanelOpen && selectedLead ? 'md:pr-[362px]' : 'pr-[0px]'}`}
      style={{
        display: 'flex',
        gap: '0',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <LeadsCategories
        leads={leads}
        activeEstado={activeEstado}
        onSelect={setActiveEstado}
      />

      <LeadsInbox leads={filteredLeads} selectedId={selectedId} asignaciones={asignaciones} />

      <LeadPanel
        lead={selectedLead}
        interacciones={interacciones}
        isTaskPanelOpen={isTaskPanelOpen && selectedLead !== null}
        onToggleTaskPanel={() => setIsTaskPanelOpen(true)}
        topLeads={leads.slice(0, 4)}
      />

      {selectedLead && (
        <LeadTaskPanel
          lead={selectedLead}
          isOpen={isTaskPanelOpen}
          onClose={() => setIsTaskPanelOpen(false)}
        />
      )}

      <LeadForm open={formOpen} onOpenChange={handleCloseForm} onSubmit={handleCreate} />
    </div>
  )
}
