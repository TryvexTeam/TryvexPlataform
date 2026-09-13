'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Lead } from '@/lib/types/lead'

/**
 * Lista de la papelera con dos acciones por lead: restaurar (reversible) y
 * borrar definitivamente (no lo es).
 *
 * El borrado definitivo se nombra por lo que realmente hace. Antes de la 104 el
 * botón decía "Eliminar" y se llevaba en silencio el hilo de WhatsApp, las
 * interacciones y el outreach del lead por ON DELETE CASCADE — nadie que lo
 * apretara podía saberlo. Acá se dice antes, no después.
 */
export function PapeleraLeads({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  const [trabajando, setTrabajando] = useState<string | null>(null)

  async function restaurar(lead: Lead) {
    setTrabajando(lead.id)
    try {
      const res = await fetch(`/api/leads/${lead.id}/papelera`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'restaurar' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Lead restaurado', { description: lead.nombre_negocio })
      router.refresh()
    } catch {
      toast.error('No se pudo restaurar')
    } finally {
      setTrabajando(null)
    }
  }

  function borrarDefinitivo(lead: Lead) {
    toast('Borrar definitivamente — no se puede deshacer', {
      description: `${lead.nombre_negocio}: se borra también su historial de WhatsApp, sus interacciones y su outreach.`,
      action: {
        label: 'Borrar para siempre',
        onClick: async () => {
          setTrabajando(lead.id)
          try {
            const res = await fetch(`/api/leads/${lead.id}/papelera`, { method: 'DELETE' })
            if (!res.ok) throw new Error()
            toast.success('Lead borrado definitivamente')
            router.refresh()
          } catch {
            toast.error('No se pudo borrar')
          } finally {
            setTrabajando(null)
          }
        },
      },
      cancel: { label: 'Cancelar', onClick: () => {} },
    })
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        La papelera está vacía.
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {leads.map((lead) => (
        <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{lead.nombre_negocio}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[lead.nicho, lead.localidad, lead.telefono].filter(Boolean).join(' · ') || 'sin datos de contacto'}
              {lead.eliminado_at ? ` · en la papelera desde ${new Date(lead.eliminado_at).toLocaleDateString('es-CL')}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => restaurar(lead)}
              disabled={trabajando === lead.id}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              Restaurar
            </button>
            <button
              onClick={() => borrarDefinitivo(lead)}
              disabled={trabajando === lead.id}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Borrar para siempre
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
