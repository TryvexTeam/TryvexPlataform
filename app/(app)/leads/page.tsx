import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { AsignacionesRepository } from '@/lib/repos/asignaciones'
import { LeadsWorkspace } from '@/components/leads/leads-workspace'

interface LeadsPageProps {
  searchParams: Promise<{ lead?: string }>
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new LeadsRepository(supabase)
  const leads = await repo.list()

  const { lead: selectedId } = await searchParams
  const interacciones = selectedId ? await repo.listInteracciones(selectedId) : []

  // Los asignados de TODOS los leads en una sola consulta. Pedirlos por tarjeta
  // sería el N+1 clásico: hoy son 541 leads en la lista.
  const asignaciones = await new AsignacionesRepository(supabase).asignacionesDeLeads(
    leads.map((l) => l.id)
  )

  return (
    <LeadsWorkspace
      leads={leads}
      selectedId={selectedId ?? null}
      interacciones={interacciones}
      asignaciones={asignaciones}
    />
  )
}
