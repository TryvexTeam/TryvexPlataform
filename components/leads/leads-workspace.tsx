'use client'

import { useState, useEffect } from 'react'
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
  // Abierto o no lo dice la URL, no un estado propio. Antes era `useState`, que
  // lee su valor inicial una sola vez: llegar con ?nuevo=1 desde otra parte de
  // /leads no abría nada, porque el componente ya estaba montado. Derivarlo de
  // la URL lo mantiene siempre en sincronía sin efectos.
  const formOpen = searchParams.get('nuevo') === '1'

  // Datos que vienen en la URL, para abrir el formulario ya con el teléfono
  // puesto cuando se crea un lead a partir de alguien que escribió por
  // WhatsApp. Sin esto habría que copiar el número a mano de una pantalla a
  // otra, que es justo donde se equivoca un dígito.
  const precargado = {
    telefono: searchParams.get('telefono') ?? undefined,
    nombre_negocio: searchParams.get('nombre') ?? undefined,
  }

  function handleCloseForm(open: boolean) {
    if (!open) {
      const params = new URLSearchParams(window.location.search)
      params.delete('nuevo')
      params.delete('telefono')
      params.delete('nombre')
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
      className={`leads-workspace relative h-full gap-0 md:gap-3 md:p-3 transition-all duration-300 ${
        selectedLead ? 'has-lead' : ''
      } ${isTaskPanelOpen && selectedLead ? 'md:pr-[362px]' : 'pr-[0px]'}`}
      // `md:gap-3 md:p-3`: en escritorio las tres columnas iban pegadas entre sí
      // y contra el filo de la ventana — el contenedor llegaba hasta el borde de
      // abajo sin margen. En móvil se queda en cero a propósito: ahí las columnas
      // se apilan y cada panel ocupa la pantalla completa, así que el padding
      // solo robaría espacio.
      //
      // El gap y el alto salen del `style` inline y pasan a clases porque un
      // valor inline no se puede cambiar por tamaño de pantalla: gana siempre.
      style={{
        display: 'flex',
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

      {/* `key` con los datos precargados: cambiarlos remonta el formulario, que
          es como React recomienda resetear estado. Sin esto, abrirlo por segunda
          vez con otro teléfono mostraría el de la vez anterior. */}
      <LeadForm
        key={`${precargado.telefono ?? ''}|${precargado.nombre_negocio ?? ''}`}
        open={formOpen}
        onOpenChange={handleCloseForm}
        inicial={precargado}
        onSubmit={handleCreate}
      />
    </div>
  )
}
